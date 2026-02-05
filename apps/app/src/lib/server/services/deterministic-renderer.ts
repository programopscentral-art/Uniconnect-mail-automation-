import { PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib';
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

        // A4 Dimensions: 210mm x 297mm
        const page = pdfDoc.addPage([
            template.page.widthMM * MM_TO_PT,
            template.page.heightMM * MM_TO_PT,
        ]);

        // 1. Render Static Elements
        for (const el of template.staticElements) {
            await this.renderStaticElement(page, el);
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

    private static async renderStaticElement(page: PDFPage, el: StaticElement) {
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
                    backgroundColor: el.backgroundColor ? this.hexToRgb(el.backgroundColor) : undefined,
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
