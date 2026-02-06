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
            // New VGU Logo is roughly square (Swami Vivekananda) - increased size
            await this.drawImage(doc, page, `file:///${vguLogoPath}`, 15, 8, 26, 26);
        }

        if (fs.existsSync(naacBadgePath)) {
            // New NAAC Badge is a vertical rectangle - increased size
            await this.drawImage(doc, page, `file:///${naacBadgePath}`, 175, 8, 20, 26);
        }

        // Center Title (2 Lines)
        const line1 = 'VIVEKANANDA GLOBAL';
        const line2 = 'UNIVERSITY, JAIPUR';

        page.drawText(line1, {
            x: 105 * MM_TO_PT - (fontBold.widthOfTextAtSize(line1, 16) / 2),
            y: pageHeight - (15 * MM_TO_PT),
            size: 16,
            font: fontBold,
            color: rgb(0, 0, 0)
        });

        page.drawText(line2, {
            x: 105 * MM_TO_PT - (fontBold.widthOfTextAtSize(line2, 14) / 2),
            y: pageHeight - (20 * MM_TO_PT),
            size: 14,
            font: fontBold,
            color: rgb(0, 0, 0)
        });

        page.drawText('(Established by Act 11/2012 of Rajasthan Govt. Covered u/s22 of UGC Act, 1956)', {
            x: 105 * MM_TO_PT - (fontRegular.widthOfTextAtSize('(Established by Act 11/2012 of Rajasthan Govt. Covered u/s22 of UGC Act, 1956)', 7) / 2),
            y: pageHeight - (24 * MM_TO_PT),
            size: 7,
            font: fontRegular,
            color: rgb(0.1, 0.1, 0.1)
        });

        // 2. Exam Title Bar
        const examTitle = (data['exam_title'] || 'II MID TERM EXAMINATIONS (THEORY), December 2025').toUpperCase();
        const etWidth = fontBold.widthOfTextAtSize(examTitle, 10);
        const etBoxW = etWidth + 60;

        page.drawRectangle({
            x: (105 * MM_TO_PT) - (etBoxW / 2),
            y: pageHeight - (35 * MM_TO_PT),
            width: etBoxW,
            height: 18,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.5
        });

        page.drawText(examTitle, {
            x: (105 * MM_TO_PT) - (etWidth / 2),
            y: pageHeight - (32 * MM_TO_PT),
            size: 10,
            font: fontBold
        });

        // Horizontal Line
        page.drawLine({
            start: { x: 15 * MM_TO_PT, y: pageHeight - (42 * MM_TO_PT) },
            end: { x: 195 * MM_TO_PT, y: pageHeight - (42 * MM_TO_PT) },
            thickness: 0.5,
            color: rgb(0, 0, 0)
        });

        // Helper for table cells
        const drawCell = (x: number, y: number, w: number, h: number, text: string, isBold = false, isCentered = false) => {
            page.drawRectangle({ x: x * MM_TO_PT, y: pageHeight - ((y + h) * MM_TO_PT), width: w * MM_TO_PT, height: h * MM_TO_PT, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
            const fontSize = 8.5;
            const textWidth = (isBold ? fontBold : fontRegular).widthOfTextAtSize(text, fontSize);
            const textX = isCentered ? (x + (w / 2)) * MM_TO_PT - (textWidth / 2) : (x + 2) * MM_TO_PT;
            page.drawText(text, { x: textX, y: pageHeight - ((y + h - 1.8) * MM_TO_PT), size: fontSize, font: isBold ? fontBold : fontRegular });
        };

        // 3. Metadata (Text Layout, No Borders)
        const drawMeta = (x: number, y: number, label: string, value: string, alignRight = false) => {
            const fontSize = 9;
            const labelWidth = fontBold.widthOfTextAtSize(label, fontSize);
            const valX = alignRight ? (195 * MM_TO_PT) - fontRegular.widthOfTextAtSize(value, fontSize) : (x + 2) * MM_TO_PT + labelWidth;
            const lblX = alignRight ? (195 * MM_TO_PT) - fontRegular.widthOfTextAtSize(value, fontSize) - labelWidth - 2 : (x + 2) * MM_TO_PT;

            page.drawText(label, { x: lblX, y: pageHeight - (y * MM_TO_PT), size: fontSize, font: fontBold });
            page.drawText(value, { x: valX, y: pageHeight - (y * MM_TO_PT), size: fontSize, font: fontRegular });
        };

        const proBatch = (data['programme'] || "B.Tech-Software Engineering").toUpperCase();
        drawMeta(15, 48, "Programme & Batch: ", proBatch);
        drawMeta(135, 48, "Semester: ", data['semester'] || "1", true);

        const courseName = (data['subject_name'] || "Computer Programming").toUpperCase();
        drawMeta(15, 53, "Course Name: ", courseName);
        drawMeta(135, 53, "Course Code: ", (data['course_code'] || "UQSE103").toUpperCase(), true);

        drawMeta(15, 58, "Duration: ", (data['duration_minutes'] || "60") + " Hr");
        drawMeta(135, 58, "M.M.: ", data['max_marks'] || "50", true);

        // 4. Instructions & COs
        let currentY = 64;
        page.drawText('Instructions: ' + (data['instructions'] || 'Before attempting any question, be sure that you get the correct question paper.'), {
            x: 17 * MM_TO_PT,
            y: pageHeight - (currentY * MM_TO_PT),
            size: 9,
            font: fontBold
        });
        currentY += 6;

        const cos = (data as any)['course_outcomes'] || [];
        if (cos.length > 0) {
            page.drawText('COURSE OUTCOMES:', {
                x: 17 * MM_TO_PT,
                y: pageHeight - (currentY * MM_TO_PT),
                size: 9,
                font: fontBold
            });
            currentY += 1.2;
            page.drawLine({
                start: { x: 17 * MM_TO_PT, y: pageHeight - (currentY * MM_TO_PT) },
                end: { x: 197 * MM_TO_PT, y: pageHeight - (currentY * MM_TO_PT) },
                thickness: 0.5,
                color: rgb(0, 0, 0)
            });
            currentY += 4;

            for (const co of cos) {
                page.drawText(`${co.code}: ${co.name || ''}`, {
                    x: 17 * MM_TO_PT,
                    y: pageHeight - (currentY * MM_TO_PT),
                    size: 8,
                    font: fontRegular
                });
                currentY += 4;
            }
        }
        currentY += 2;

        // 5. Question Table Header
        currentY += 4;
        const colWidths = [24, 96, 20, 20, 20]; // Total 180 (15 start, 195 end)
        const colStarts = [15, 39, 135, 155, 175];
        const headers = ["Question", "Question", "Mark", "K Level (K1/K6)", "CO Indicators"];

        for (let i = 0; i < headers.length; i++) {
            drawCell(colStarts[i], currentY, colWidths[i], 12, headers[i], true, true);
        }
        currentY += 12;

        // 6. Render Questions
        const questions = Array.isArray(data['questions']) ? data['questions'] : (Array.isArray(data) ? data : []);
        const paperStructure = (template.metadata as any)?.paperStructure || [
            { part: 'A', title: 'Section A (1*10=10 Marks) Answer all Question No- 1-10', marks_per_q: 1 },
            { part: 'B', title: 'Section B (5*3=15 Marks) Attempt any three questions', marks_per_q: 5 }
        ];

        let qNumberCounter = 1;
        for (const section of paperStructure) {
            const sectionQuestions = questions.filter((q: any) => q && (q.part === section.part || (!q.part && section.part === 'A')));

            if (sectionQuestions.length > 0) {
                // Section Header Row
                drawCell(15, currentY, 180, 8, section.title, true);
                currentY += 8;

                for (const qObj of sectionQuestions) {
                    const qText = qObj.text || qObj.question_text || "";
                    const marks = String(qObj.marks || section.marks_per_q || "1");
                    const kLevel = qObj.k_level || "K1";
                    const co = qObj.co_indicator || "CO1";
                    const sno = (section.part !== 'A' ? "Q." : "") + qNumberCounter + (section.part === 'A' ? "." : "");

                    // Draw SNo
                    drawCell(colStarts[0], currentY, colWidths[0], 20, sno, true, true);

                    // Draw Question (with wrapping)
                    const qX = colStarts[1] * MM_TO_PT;
                    const qY = pageHeight - (currentY * MM_TO_PT);
                    const qW = colWidths[1] * MM_TO_PT;

                    // Just draw the border box first
                    drawCell(colStarts[1], currentY, colWidths[1], 20, "");

                    // Draw the wrapped text
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
                    drawCell(colStarts[2], currentY, colWidths[2], 20, marks, false, true);
                    drawCell(colStarts[3], currentY, colWidths[3], 20, kLevel, false, true);
                    drawCell(colStarts[4], currentY, colWidths[4], 20, co, false, true);

                    currentY += 20;
                    qNumberCounter++;

                    if (currentY > 270) {
                        // TODO: handle page break properly
                    }
                }
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
