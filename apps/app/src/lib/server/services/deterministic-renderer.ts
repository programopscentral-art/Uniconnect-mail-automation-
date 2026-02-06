import { PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib';
import fs from 'node:fs';
import type { CanonicalTemplate, SlotDefinition, StaticElement } from '@uniconnect/shared';

/**
 * MM to Points conversion (1mm = 2.83465 pt)
 */
const MM_TO_PT = 2.83465;

export class DeterministicRenderer {
    /**
     * Generates a deterministic PDF from a CanonicalTemplate and data
     */
    public static async renderToBuffer(template: CanonicalTemplate, data: Record<string, any>): Promise<Buffer> {
        const pdfDoc = await PDFDocument.create();

        // 0. specialized Style Overrides
        if (template.style === 'vgu') {
            return await this.drawVguLayout(pdfDoc, template, data);
        }

        // A4 Dimensions: 210mm x 297mm
        const page = pdfDoc.addPage([
            template.page.widthMM * MM_TO_PT,
            template.page.heightMM * MM_TO_PT,
        ]);

        // 0. Render Background Image
        if (template.backgroundImageUrl) {
            await this.renderBackground(pdfDoc, page, template.backgroundImageUrl);
        }

        // 1. Render Static Elements
        for (const el of template.staticElements) {
            await this.renderStaticElement(page, el, pdfDoc);
        }

        // 2. Render Slots
        const slots = template.slots;
        for (const [key, slot] of Object.entries(slots)) {
            const value = data[key] || (slot.isRequired ? `MISSING: ${key}` : '');
            if (value) {
                await this.renderSlot(page, slot, String(value), pdfDoc);
            }
        }

        const pdfBytes = await pdfDoc.save();
        return Buffer.from(pdfBytes);
    }

    private static async drawVguLayout(doc: PDFDocument, template: CanonicalTemplate, data: Record<string, any>): Promise<Buffer> {
        const page = doc.addPage([210 * MM_TO_PT, 297 * MM_TO_PT]);
        const { height: pageHeight } = page.getSize();
        const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
        const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

        // 1. Header & Logos
        const vguLogoPath = 'c:/Desktop/uniconnect-mail-automation/apps/app/static/vgu-logo.png';
        const naacBadgePath = 'c:/Desktop/uniconnect-mail-automation/apps/app/static/vgu-naac-badge.png';

        if (fs.existsSync(vguLogoPath)) {
            await this.drawImage(doc, page, `file:///${vguLogoPath}`, 15, 10, 22, 22);
        }

        if (fs.existsSync(naacBadgePath)) {
            await this.drawImage(doc, page, `file:///${naacBadgePath}`, 172, 10, 25, 18);
        }

        // Center Title
        page.drawText('VIVEKANANDA GLOBAL UNIVERSITY, JAIPUR', {
            x: 105 * MM_TO_PT - (fontBold.widthOfTextAtSize('VIVEKANANDA GLOBAL UNIVERSITY, JAIPUR', 14) / 2),
            y: pageHeight - (16 * MM_TO_PT),
            size: 14,
            font: fontBold,
            color: rgb(0, 0, 0)
        });

        page.drawText('(Established by Act 11/2012 of Rajasthan Govt. Covered u/s22 of UGC Act, 1956)', {
            x: 105 * MM_TO_PT - (fontRegular.widthOfTextAtSize('(Established by Act 11/2012 of Rajasthan Govt. Covered u/s22 of UGC Act, 1956)', 7.5) / 2),
            y: pageHeight - (20 * MM_TO_PT),
            size: 7.5,
            font: fontRegular,
            color: rgb(0.1, 0.1, 0.1)
        });

        // Exam Title
        const examTitle = data['exam_title'] || 'II MID TERM EXAMINATIONS (THEORY), December 2025';
        const etWidth = fontBold.widthOfTextAtSize(examTitle, 10);
        page.drawRectangle({
            x: (105 * MM_TO_PT) - (etWidth / 2) - 15,
            y: pageHeight - (32 * MM_TO_PT),
            width: etWidth + 30,
            height: 14,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.5
        });
        page.drawText(examTitle.toUpperCase(), {
            x: (105 * MM_TO_PT) - (etWidth / 2),
            y: pageHeight - (29 * MM_TO_PT),
            size: 10,
            font: fontBold
        });

        // 2. Metadata Table
        const drawCell = (x: number, y: number, w: number, h: number, text: string, isBold = false, isCentered = false) => {
            page.drawRectangle({ x: x * MM_TO_PT, y: pageHeight - ((y + h) * MM_TO_PT), width: w * MM_TO_PT, height: h * MM_TO_PT, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
            const fontSize = 8.5;
            const textWidth = (isBold ? fontBold : fontRegular).widthOfTextAtSize(text, fontSize);
            const textX = isCentered ? (x + (w / 2)) * MM_TO_PT - (textWidth / 2) : (x + 2) * MM_TO_PT;
            page.drawText(text, { x: textX, y: pageHeight - ((y + h - 1.8) * MM_TO_PT), size: fontSize, font: isBold ? fontBold : fontRegular });
        };

        let currentY = 38;
        drawCell(15, currentY, 40, 7, "Programme & Batch", true);
        drawCell(55, currentY, 80, 7, (data['programme'] || "").toUpperCase());
        drawCell(135, currentY, 30, 7, "Semester", true);
        drawCell(165, currentY, 30, 7, data['semester'] || "");

        currentY += 7;
        drawCell(15, currentY, 40, 7, "Course Name", true);
        drawCell(55, currentY, 80, 7, (data['subject_name'] || "").toUpperCase());
        drawCell(135, currentY, 30, 7, "Course Code", true);
        drawCell(165, currentY, 30, 7, (data['course_code'] || "").toUpperCase());

        currentY += 7;
        drawCell(15, currentY, 40, 7, "Duration", true);
        drawCell(55, currentY, 80, 7, (data['duration_minutes'] || "60") + " Hr");
        drawCell(135, currentY, 30, 7, "M.M.", true);
        drawCell(165, currentY, 30, 7, data['max_marks'] || "50");

        // 3. Question Table Header
        currentY += 6;
        const colWidths = [30, 90, 20, 20, 20]; // Total 180 (15 start, 195 end)
        const colStarts = [15, 45, 135, 155, 175];
        const headers = ["Question", "Question", "Mark", "K Level", "CO"];

        for (let i = 0; i < headers.length; i++) {
            drawCell(colStarts[i], currentY, colWidths[i], 10, headers[i], true, true);
        }
        currentY += 10;

        // 4. Render Questions
        // Note: data should have questions in a specific way or we use slots
        // For simplicity, we assume slots map to Q_1, Q_2 etc and use renderSlot logic
        const slots = Object.entries(template.slots).sort((a, b) => a[0].localeCompare(b[0]));

        for (const [key, slot] of slots) {
            const val = data[key] || "";
            if (!val) continue;

            const sno = key.replace('Q_', '');

            // Extract rich data if possible (thanks to the updated render API)
            const slotData = typeof val === 'object' ? val : { questions: [{ text: val }] };
            const qObj = slotData.questions?.[0] || slotData;
            const qText = qObj.text || qObj.question_text || "";
            const marks = String(qObj.marks || "1");
            const kLevel = qObj.k_level || "K1";
            const co = qObj.co_indicator || "CO1";

            // Draw SNo
            drawCell(colStarts[0], currentY, colWidths[0], 20, sno);

            // Draw Question (with wrapping)
            const qX = colStarts[1] * MM_TO_PT;
            const qY = pageHeight - (currentY * MM_TO_PT);
            const qW = colWidths[1] * MM_TO_PT;

            // Custom simplified wrap just for this table
            const words = qText.split(' ');
            let line = '';
            let lineY = qY - 10;
            for (const word of words) {
                const test = line ? line + ' ' + word : word;
                if (fontRegular.widthOfTextAtSize(test, 9) > qW - 10) {
                    page.drawText(line, { x: qX + 5, y: lineY, size: 9, font: fontRegular });
                    line = word;
                    lineY -= 12;
                } else {
                    line = test;
                }
            }
            if (line) page.drawText(line, { x: qX + 5, y: lineY, size: 9, font: fontRegular });

            // Draw Rest of columns
            drawCell(colStarts[1], currentY, colWidths[1], 20, ""); // Just the border for Q cell
            drawCell(colStarts[2], currentY, colWidths[2], 20, marks);
            drawCell(colStarts[3], currentY, colWidths[3], 20, kLevel);
            drawCell(colStarts[4], currentY, colWidths[4], 20, co);

            currentY += 20;

            if (currentY > 270) {
                // TODO: page break
            }
        }

        const pdfBytes = await doc.save();
        return Buffer.from(pdfBytes);
    }

    private static async renderStaticElement(page: PDFPage, el: StaticElement, doc: PDFDocument) {
        const { height } = page.getSize();

        switch (el.type) {
            case 'text':
                page.drawText(el.content, {
                    x: el.xMM * MM_TO_PT,
                    y: height - (el.yMM * MM_TO_PT) - (el.style.fontSizeMM * MM_TO_PT), // Top-left origin adjustment
                    size: el.style.fontSizeMM * MM_TO_PT,
                    color: this.hexToRgb(el.style.color),
                });
                break;
            case 'rect':
                page.drawRectangle({
                    x: el.xMM * MM_TO_PT,
                    y: height - (el.yMM * MM_TO_PT) - (el.heightMM * MM_TO_PT),
                    width: el.widthMM * MM_TO_PT,
                    height: el.heightMM * MM_TO_PT,
                    borderColor: el.borderColor ? this.hexToRgb(el.borderColor) : undefined,
                    color: el.backgroundColor ? this.hexToRgb(el.backgroundColor) : undefined,
                    borderWidth: (el.strokeWidthMM || 0) * MM_TO_PT,
                });
                break;
            case 'line':
                page.drawLine({
                    start: { x: el.x1MM * MM_TO_PT, y: height - (el.y1MM * MM_TO_PT) },
                    end: { x: el.x2MM * MM_TO_PT, y: height - (el.y2MM * MM_TO_PT) },
                    thickness: el.strokeWidthMM * MM_TO_PT,
                    color: this.hexToRgb(el.color),
                });
                break;
            case 'image':
                await this.drawImage(doc, page, el.url, el.xMM, el.yMM, el.widthMM, el.heightMM);
                break;
        }
    }

    private static async renderBackground(doc: PDFDocument, page: PDFPage, url: string) {
        const { width, height } = page.getSize();
        await this.drawImage(doc, page, url, 0, 0, width / MM_TO_PT, height / MM_TO_PT);
    }

    private static async drawImage(doc: PDFDocument, page: PDFPage, url: string, xMM: number, yMM: number, widthMM: number, heightMM: number) {
        try {
            const { height: pageHeight } = page.getSize();
            let imagePath = url;
            if (url.startsWith('file:///')) {
                imagePath = url.replace('file:///', '');
            }

            if (!fs.existsSync(imagePath)) {
                console.warn(`[DeterministicRenderer] Image not found: ${imagePath}`);
                return;
            }

            const imageBytes = fs.readFileSync(imagePath);
            const isPng = imagePath.toLowerCase().endsWith('.png');
            const image = isPng ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);

            page.drawImage(image, {
                x: xMM * MM_TO_PT,
                y: pageHeight - (yMM * MM_TO_PT) - (heightMM * MM_TO_PT),
                width: widthMM * MM_TO_PT,
                height: heightMM * MM_TO_PT,
            });
        } catch (err) {
            console.error(`[DeterministicRenderer] Failed to draw image: ${url}`, err);
        }
    }

    private static async renderSlot(page: PDFPage, slot: SlotDefinition, value: string, doc: PDFDocument) {
        const { height: pageHeight } = page.getSize();
        const fontSize = slot.style.fontSizeMM * MM_TO_PT;

        // Simplification for V1: Standard Font (Inter/Helvetica)
        const font = await doc.embedFont(StandardFonts.Helvetica);

        const x = slot.xMM * MM_TO_PT;
        const yOrigin = pageHeight - (slot.yMM * MM_TO_PT); // Slot top boundary
        const maxWidth = slot.widthMM * MM_TO_PT;

        // Greedy word wrap
        const words = value.split(' ');
        let currentLine = '';
        let currentY = yOrigin - fontSize;

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const textWidth = font.widthOfTextAtSize(testLine, fontSize);

            if (textWidth > maxWidth && currentLine) {
                page.drawText(currentLine, { x, y: currentY, size: fontSize, font, color: this.hexToRgb(slot.style.color) });
                currentLine = word;
                currentY -= fontSize * (slot.style.lineHeightMM ? slot.style.lineHeightMM / slot.style.fontSizeMM : 1.2);

                // Overflow check
                if (currentY < (pageHeight - (slot.yMM + slot.heightMM) * MM_TO_PT)) {
                    if (slot.overflow === 'clip') break;
                    // TODO: next_page support
                }
            } else {
                currentLine = testLine;
            }
        }

        if (currentLine) {
            page.drawText(currentLine, { x, y: currentY, size: fontSize, font, color: this.hexToRgb(slot.style.color) });
        }
    }

    private static hexToRgb(hex: string) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return rgb(r, g, b);
    }
}
