import cv2
import numpy as np
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
    def __init__(self, credentials_path=None):
        """Initialize Google Cloud Vision client"""
        if credentials_path:
            credentials = service_account.Credentials.from_service_account_file(credentials_path)
            self.client = vision.ImageAnnotatorClient(credentials=credentials)
        else:
            # Uses default credentials from environment
            try:
                self.client = vision.ImageAnnotatorClient()
            except Exception as e:
                print(f"Warning: Could not initialize Vision client: {e}")
                self.client = None
    
    def extract_template_structure(self, image_bytes):
        """Main extraction function combining Vision + OpenCV"""
        
        # 1. Google Vision for Text Detection
        image = vision.Image(content=image_bytes)
        response = self.client.document_text_detection(image=image)
        
        if response.error.message:
            raise Exception(f'Vision API Error: {response.error.message}')
        
        # 2. OpenCV for Layout (Lines/Tables)
        # Convert bytes to opencv image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        lines = self._detect_structural_lines(img)
        
        # 3. Parse and Map to UniConnect Schema
        template_data = self._parse_document(response.full_text_annotation, img.shape[0], img.shape[1], lines)
        
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
        
        # Extract line coordinates
        lines = []
        
        # Probabilistic Hough Transform for cleaner vector lines
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

    def _parse_document(self, annotation, page_height, page_width, cv_lines):
        """Parse the document annotation into UniConnect LayoutSchema"""
        
        # Conversion factor for mm (assuming 72 DPI or 300 DPI - standard Vision is 1:1 pixel)
        # We need to map pixel coordinates to mm for the editor
        # Standard A4 at 96 DPI is ~794x1123px.
        # We'll use a dynamic ratio based on Vision's reported page size vs A4(210x297)
        px_to_mm_x = 210.0 / page_width
        px_to_mm_y = 297.0 / page_height

        elements = []
        
        # Add CV Lines first
        for idx, line in enumerate(cv_lines):
            x = line['x1'] * px_to_mm_x
            y = line['y1'] * px_to_mm_y
            w = (line['x2'] - line['x1']) * px_to_mm_x
            h = (line['y2'] - line['y1']) * px_to_mm_y
            
            # Line thickness fix for schema
            if line['orientation'] == 'horizontal':
                h = max(h, 0.5)
            else:
                w = max(w, 0.5)

            elements.append({
                'id': f'cv-line-{idx}',
                'type': 'line',
                'x': round(x, 2),
                'y': round(y, 2),
                'w': round(max(w, 1.0), 2),
                'h': round(max(h, 1.0), 2),
                'orientation': line['orientation'],
                'thickness': 1,
                'color': '#000000'
            })

        all_blocks = []
        for page in annotation.pages:
            for block in page.blocks:
                text = self._get_block_text(block)
                if self._is_question(text): continue
                
                vertices = block.bounding_box.vertices
                x = vertices[0].x * px_to_mm_x
                y = vertices[0].y * px_to_mm_y
                w = (vertices[2].x - vertices[0].x) * px_to_mm_x
                h = (vertices[2].y - vertices[0].y) * px_to_mm_y
                
                all_blocks.append({
                    'text': text,
                    'x': x, 'y': y, 'w': w, 'h': h,
                    'is_header': self._is_header(block, page.height)
                })

        # Process text elements
        for idx, block in enumerate(all_blocks):
            type_tag = 'text'
            content = block['text']
            
            # Simple HTML wrap for headers
            if block['is_header']:
                content = f'<div style="text-align: center;"><h1>{content}</h1></div>'
            else:
                content = f'<div>{content}</div>'

            elements.append({
                'id': f'vision-text-{idx}',
                'type': 'text',
                'x': round(block['x'], 2),
                'y': round(block['y'], 2),
                'w': round(block['w'], 2),
                'h': round(block['h'], 2),
                'content': content,
                'styles': {
                    'fontFamily': 'Outfit, sans-serif',
                    'fontSize': 16 if block['is_header'] else 12,
                    'fontWeight': 'bold' if block['is_header'] else 'normal'
                }
            })

        return {
            'page': { 'width': 'A4', 'unit': 'mm', 'margins': { 'top': 10, 'bottom': 10, 'left': 10, 'right': 10 } },
            'pages': [{ 'id': 'p1', 'elements': elements }]
        }

    def _get_block_text(self, block):
        text = ""
        for paragraph in block.paragraphs:
            for word in paragraph.words:
                text += ''.join([s.text for s in word.symbols]) + " "
            text += "\n"
        return text.strip()

    def _is_question(self, text):
        pattern = r'^\d+\.|^[a-z]\)|^[ivx]+\.|what is|explain|define|describe|attempt any'
        return any(re.search(pattern, text.lower()) for pattern in pattern.split('|'))

    def _is_header(self, block, page_height):
        y_top = block.bounding_box.vertices[0].y
        return y_top < (page_height * 0.25) or "university" in self._get_block_text(block).lower()

app = Flask(__name__)
CORS(app)
extractor = TemplateExtractor()

@app.route('/api/extract-template', methods=['POST'])
def extract():
    try:
        if 'file' in request.files:
            content = request.files['file'].read()
        else:
            data = request.json.get('image', '')
            content = base64.b64decode(data.split(',')[-1])
        
        result = extractor.extract_template_structure(content)
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    # Bind to 0.0.0.0 to allow internal networking on Railway/Docker
    app.run(host='0.0.0.0', port=port)
