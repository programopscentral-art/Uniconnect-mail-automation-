import cv2
import numpy as np
import os
import io
import json
import re
import base64
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from google.cloud import vision
from google.oauth2 import service_account
from typing import Dict, List, Tuple

app = Flask(__name__)
CORS(app)

class HighFidelityExtractor:
    def __init__(self):
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

    def process(self, image_bytes):
        if not self.client:
            raise Exception("Vision client not initialized")

        # 1. Image loading for OpenCV
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise Exception("Invalid image data")

        height, width = img.shape[:2]
        # Standard mm dimensions (A4 fallback)
        mm_w, mm_h = 210, 297
        px_to_mm_x = mm_w / width
        px_to_mm_y = mm_h / height

        # 2. Google Vision for Text detection
        vision_image = vision.Image(content=image_bytes)
        response = self.client.document_text_detection(image=vision_image)
        
        elements = []
        dynamic_slots = []
        
        # 3. OpenCV Structural Detection (Lines & Rects)
        structural_elements = self._detect_structure(img, px_to_mm_x, px_to_mm_y)
        elements.extend(structural_elements)

        # 4. Parse Text Blocks & Classify
        if response.full_text_annotation:
            text_elements, slots = self._parse_text_blocks(
                response.full_text_annotation, 
                px_to_mm_x, px_to_mm_y, 
                width, height
            )
            elements.extend(text_elements)
            dynamic_slots.extend(slots)

        # 5. Add Logo Placeholder (Top-left/Center-top heuristic)
        elements.append({
            "id": "logo-slot",
            "type": "image-slot",
            "x": 10, "y": 10, "width": 30, "height": 30,
            "slotName": "logo"
        })

        return {
            "page": {"width": mm_w, "height": mm_h},
            "elements": elements,
            "dynamicSlots": dynamic_slots
        }

    def _detect_structure(self, img, scale_x, scale_y):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Adaptive threshold for better line detection
        bw = cv2.adaptiveThreshold(~gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 15, -2)
        
        elements = []
        
        # Horizontal lines
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (img.shape[1] // 40, 1))
        h_lines_img = cv2.erode(bw, h_kernel)
        h_lines_img = cv2.dilate(h_lines_img, h_kernel)
        
        h_lines = cv2.HoughLinesP(h_lines_img, 1, np.pi/180, 50, minLineLength=50, maxLineGap=10)
        if h_lines is not None:
            for i, l in enumerate(h_lines):
                x1, y1, x2, y2 = l[0]
                elements.append({
                    "id": f"line-h-{i}-{hash(l[0].tobytes())}",
                    "type": "line",
                    "x1": round(x1 * scale_x, 2), "y1": round(y1 * scale_y, 2),
                    "x2": round(x2 * scale_x, 2), "y2": round(y2 * scale_y, 2),
                    "strokeWidth": 0.5,
                    "orientation": "horizontal",
                    "color": "#000000"
                })

        # Vertical lines
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, img.shape[0] // 40))
        v_lines_img = cv2.erode(bw, v_kernel)
        v_lines_img = cv2.dilate(v_lines_img, v_kernel)
        
        v_lines = cv2.HoughLinesP(v_lines_img, 1, np.pi/180, 50, minLineLength=50, maxLineGap=10)
        if v_lines is not None:
            for i, l in enumerate(v_lines):
                x1, y1, x2, y2 = l[0]
                elements.append({
                    "id": f"line-v-{i}-{hash(l[0].tobytes())}",
                    "type": "line",
                    "x1": round(x1 * scale_x, 2), "y1": round(y1 * scale_y, 2),
                    "x2": round(x2 * scale_x, 2), "y2": round(y2 * scale_y, 2),
                    "strokeWidth": 0.5,
                    "orientation": "vertical",
                    "color": "#000000"
                })

        # Rectangles (Tables/Boxes)
        contours, _ = cv2.findContours(bw, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        for i, cnt in enumerate(contours):
            x, y, w, h = cv2.boundingRect(cnt)
            # Filter for meaningful boxes (not too small, not the whole page)
            if w > 20 and h > 10 and w < img.shape[1] * 0.9:
                elements.append({
                    "id": f"rect-{i}-{x}-{y}",
                    "type": "rect",
                    "x": round(x * scale_x, 2), "y": round(y * scale_y, 2),
                    "width": round(w * scale_x, 2), "height": round(h * scale_y, 2),
                    "strokeWidth": 0.5,
                    "backgroundColor": "transparent",
                    "borderColor": "#000000"
                })
        
        return elements

    def _parse_text_blocks(self, annotation, scale_x, scale_y, img_w, img_h):
        elements = []
        slots = []
        
        for page in annotation.pages:
            for block in page.blocks:
                paragraph_texts = []
                for paragraph in block.paragraphs:
                    text = "".join(["".join([symbol.text for symbol in word.symbols]) for word in paragraph.words])
                    paragraph_texts.append(text)
                
                full_text = " ".join(paragraph_texts).strip()
                if not full_text or self._is_question(full_text):
                    continue
                
                # Get bounding box
                vertices = block.bounding_box.vertices
                bx = min(v.x for v in vertices)
                by = min(v.y for v in vertices)
                bw = max(v.x for v in vertices) - bx
                bh = max(v.y for v in vertices) - by
                
                # Classification
                is_header = self._is_header(full_text, by, img_h)
                is_meta = self._is_metadata(full_text)
                
                style = {
                    "fontSize": 14 if is_header else 10,
                    "fontWeight": "bold" if is_header else "normal",
                    "align": "center" if is_header else "left",
                    "color": "#000000"
                }

                element_id = f"text-{bx}-{by}"
                elements.append({
                    "id": element_id,
                    "type": "text",
                    "x": round(bx * scale_x, 2), "y": round(by * scale_y, 2),
                    "width": round(bw * scale_x, 2), "height": round(bh * scale_y, 2),
                    "text": full_text,
                    "style": style
                })

                if is_meta:
                    key = self._get_meta_key(full_text)
                    if key:
                        slots.append({
                            "key": key,
                            "type": "text",
                            "anchorElementId": element_id
                        })

        return elements, slots

    def _is_question(self, text):
        # Improved question detection: look for numbers followed by dots, choices, etc.
        patterns = [
            r'^\d+[\.\)]', r'^[a-z][\.\)]', r'^[A-D][\.\)]',
            r'\bwhat\s+is\b', r'\bexplain\b', r'\bdescribe\b',
            r'\bcho[o]?se\s+the\b', r'\banswer\s+all\b'
        ]
        text_lower = text.lower()
        return any(re.search(p, text_lower) for p in patterns)

    def _is_header(self, text, y, img_h):
        # Heuristic: top 15% of page + keywords or all caps
        is_top = y < (img_h * 0.15)
        keywords = ['university', 'college', 'institute', 'test', 'examination', 'question paper']
        has_keyword = any(k in text.lower() for k in keywords)
        return (is_top and len(text) > 4) or has_keyword or text.isupper()

    def _is_metadata(self, text):
        keywords = ['duration', 'time', 'marks', 'code', 'subject', 'program', 'branch']
        return any(k in text.lower() for k in keywords)

    def _get_meta_key(self, text):
        t = text.lower()
        if 'university' in t: return 'UNIVERSITY_NAME'
        if 'time' in t or 'duration' in t: return 'TIME'
        if 'marks' in t: return 'MAX_MARKS'
        if 'code' in t: return 'SUBJECT_CODE'
        if 'subject' in t: return 'SUBJECT_NAME'
        return None

extractor = HighFidelityExtractor()

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"ok": True})

@app.route('/api/extract-template', methods=['POST'])
def extract():
    try:
        if 'file' in request.files:
            file = request.files['file']
            image_bytes = file.read()
        else:
            # Fallback for base64 if needed
            data = request.json.get('image', '')
            image_bytes = base64.b64decode(data.split(',')[-1])

        result = extractor.process(image_bytes)
        return jsonify(result)
    except Exception as e:
        print(f"❌ Extraction Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
