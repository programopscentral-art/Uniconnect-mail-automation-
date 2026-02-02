import cv2
import numpy as np
import os
from google.cloud import vision
from google.oauth2 import service_account
import io
import json
import re
import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from typing import Dict, List, Tuple

class TemplateExtractor:
    def __init__(self):
        """Initialize Google Cloud Vision client from environment"""
        try:
            credentials_json = os.environ.get('GOOGLE_CREDENTIALS_JSON')
            if credentials_json:
                credentials_dict = json.loads(credentials_json)
                credentials = service_account.Credentials.from_service_account_info(credentials_dict)
                self.client = vision.ImageAnnotatorClient(credentials=credentials)
                print("✅ Vision API initialized with GOOGLE_CREDENTIALS_JSON")
            else:
                self.client = vision.ImageAnnotatorClient()
                print("✅ Vision API initialized with default credentials")
        except Exception as e:
            print(f"❌ Error initializing Vision API: {e}")
            self.client = None
    
    def extract_template_structure(self, image_bytes):
        """Main extraction function combining Vision + OpenCV"""
        if not self.client:
            raise Exception("Vision client not initialized")

        # 1. Google Vision for Text Detection
        image = vision.Image(content=image_bytes)
        response = self.client.document_text_detection(image=image)
        
        if response.error.message:
            raise Exception(f'Vision API Error: {response.error.message}')
        
        # Check if text was detected
        if not response.full_text_annotation.pages:
            raise Exception("No text detected in the document")

        # 2. OpenCV for Layout (Lines/Tables)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise Exception("Failed to decode image. The file may be corrupted or in an unsupported format.")
            
        lines = self._detect_structural_lines(img)
        
        # 3. Parse and Map
        page = response.full_text_annotation.pages[0]
        template_data = self._parse_document(page, img.shape[0], img.shape[1], lines)
        
        return template_data

    def _detect_structural_lines(self, img):
        """Detect horizontal and vertical lines using Morphological Ops"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        bw = cv2.adaptiveThreshold(~gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 15, -2)
        
        horizontal = bw.copy()
        vertical = bw.copy()
        
        # Horizontal lines
        cols = horizontal.shape[1]
        horizontal_size = cols // 30
        horizontal_struct = cv2.getStructuringElement(cv2.MORPH_RECT, (horizontal_size, 1))
        horizontal = cv2.erode(horizontal, horizontal_struct)
        horizontal = cv2.dilate(horizontal, horizontal_struct)
        
        # Vertical lines
        rows = vertical.shape[0]
        vertical_size = rows // 30
        vertical_struct = cv2.getStructuringElement(cv2.MORPH_RECT, (1, vertical_size))
        vertical = cv2.erode(vertical, vertical_struct)
        vertical = cv2.dilate(vertical, vertical_struct)
        
        lines = []
        h_lines = cv2.HoughLinesP(horizontal, 1, np.pi/180, 50, minLineLength=50, maxLineGap=10)
        v_lines = cv2.HoughLinesP(vertical, 1, np.pi/180, 50, minLineLength=50, maxLineGap=10)
        
        if h_lines is not None:
            for l in h_lines:
                x1, y1, x2, y2 = l[0]
                lines.append({'type': 'line', 'orientation': 'horizontal', 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2})
        if v_lines is not None:
            for l in v_lines:
                x1, y1, x2, y2 = l[0]
                lines.append({'type': 'line', 'orientation': 'vertical', 'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2})
        return lines

    def _parse_document(self, page, page_height, page_width, cv_lines):
        px_to_mm_x = 210.0 / page_width
        px_to_mm_y = 297.0 / page_height
        elements = []
        metadata_fields = {}

        # Add CV Lines
        for idx, line in enumerate(cv_lines):
            x = line['x1'] * px_to_mm_x
            y = line['y1'] * px_to_mm_y
            w = (line['x2'] - line['x1']) * px_to_mm_x
            h = (line['y2'] - line['y1']) * px_to_mm_y
            elements.append({
                'id': f'cv-line-{idx}', 'type': 'line',
                'x': round(x, 2), 'y': round(y, 2),
                'w': round(max(w, 1.0), 2), 'h': round(max(h, 1.0), 2),
                'orientation': line['orientation'], 'thickness': 1, 'color': '#000000'
            })

        # Process text blocks
        for idx, block in enumerate(page.blocks):
            text = self._get_block_text(block)
            if not text or self._is_question(text): continue
            
            vertices = block.bounding_box.vertices
            x = vertices[0].x * px_to_mm_x
            y = vertices[0].y * px_to_mm_y
            w = (vertices[2].x - vertices[0].x) * px_to_mm_x
            h = (vertices[2].y - vertices[0].y) * px_to_mm_y
            
            is_hdr = self._is_header(text, vertices[0].y, page_height)
            is_meta = self._is_metadata(text)
            
            if is_meta:
                extracted = self._extract_metadata_values(text)
                metadata_fields.update(extracted)

            content = f'<div style="text-align: {"center" if is_hdr else "left"};">{"<h1>" if is_hdr else ""}{text}{"</h1>" if is_hdr else ""}</div>'

            elements.append({
                'id': f'vision-block-{idx}',
                'type': 'text',
                'x': round(x, 2), 'y': round(y, 2), 'w': round(w, 2), 'h': round(h, 2),
                'content': content,
                'is_header': is_hdr,
                'is_metadata': is_meta,
                'styles': {
                    'fontFamily': 'Outfit, sans-serif',
                    'fontSize': 16 if is_hdr else 12,
                    'fontWeight': 'bold' if is_hdr else 'normal'
                }
            })

        return {
            'page': { 'width': 'A4', 'unit': 'mm', 'margins': { 'top': 10, 'bottom': 10, 'left': 10, 'right': 10 } },
            'pages': [{ 'id': 'p1', 'elements': elements }],
            'metadata_fields': metadata_fields
        }

    def _get_block_text(self, block):
        text = ""
        for paragraph in block.paragraphs:
            for word in paragraph.words:
                text += ''.join([s.text for s in word.symbols]) + " "
            text += "\n"
        return text.strip()

    def _is_question(self, text):
        patterns = [
            r'^\d+\.', r'^[a-z]\)', r'^[ivx]+\.',
            r'choose\s+the\s+correct', r'what\s+is', r'which\s+of',
            r'describe', r'explain', r'state\s+the', r'define',
            r'answer\s+the\s+following', r'attempt\s+any', r'\b[A-D]\)'
        ]
        text_lower = text.lower().strip()
        return any(re.search(p, text_lower) for p in patterns)

    def _is_header(self, text, y_pos, page_height):
        is_top = y_pos < (page_height * 0.25)
        keywords = ['university', 'college', 'campus', 'institute', 'test', 'examination', 'exam', 'assessment']
        has_keyword = any(k in text.lower() for k in keywords)
        is_caps = text.isupper() and len(text) > 5
        return is_top or has_keyword or is_caps

    def _is_metadata(self, text):
        keywords = ['time:', 'marks:', 'date:', 'duration:', 'subject:', 'code:', 'program:', 'branch:', 'sem:', 'regulation:']
        return any(k in text.lower() for k in keywords)

    def _extract_metadata_values(self, text):
        metadata = {}
        patterns = {
            'time': r'time:\s*(.+?)(?:\n|max|$)',
            'max_marks': r'marks:\s*(\d+)',
            'date': r'date:\s*(.+?)(?:\n|$)',
            'subject_name': r'subject\s+name:\s*(.+?)(?:\n|$)',
            'subject_code': r'subject\s+code:\s*(.+?)(?:\n|$)',
            'semester': r'sem:\s*(.+?)(?:\n|$)'
        }
        for key, p in patterns.items():
            match = re.search(p, text.lower(), re.IGNORECASE)
            if match: metadata[key] = match.group(1).strip()
        return metadata

app = Flask(__name__)
CORS(app)
extractor = TemplateExtractor()

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'vision_initialized': extractor.client is not None,
        'version': '1.1.1'
    })

@app.route('/api/extract-template', methods=['POST'])
def extract():
    print(f"[EXTRACTOR] 📥 Incoming request: {request.method} {request.path}")
    try:
        if 'file' in request.files:
            file = request.files['file']
            print(f"[EXTRACTOR] 📄 Processing file: {file.filename}")
            content = file.read()
        else:
            data = request.json.get('image', '')
            print(f"[EXTRACTOR] 🖼️ Processing base64 image data")
            content = base64.b64decode(data.split(',')[-1])
        
        result = extractor.extract_template_structure(content)
        print(f"[EXTRACTOR] ✅ Successfully extracted {len(result.get('pages', [])[0].get('elements', []))} elements")
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        print(f"[EXTRACTOR] ❌ Error during extraction: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    # Bind to 0.0.0.0 to allow internal networking on Railway/Docker
    app.run(host='0.0.0.0', port=port)
