/**
 * V62: Structured Template Element Schema
 * This supports both Figma-imported slots and OCR-detected regions.
 */
export interface TemplateElement {
    id: string; // Unique ID (e.g., slot_id or auto-generated)
    slot_id?: string; // Explicitly defined key from Figma (e.g., {{PART_A_Q1_TEXT}})
    type: 'header-field' | 'table-cell' | 'text' | 'image' | 'line';
    slot_type?: 'HEADER' | 'TEXT' | 'MCQ' | 'MARK' | 'CO' | 'BLOOM';
    page: number;
    x: number; // normalized [0..1]
    y: number; // normalized [0..1]
    w: number; // normalized [0..1]
    h: number; // normalized [0..1]
    text: string;
    content?: string; // V69: Alias for text to match editor expectation
    styles: { // V69: Renamed from style to styles
        fontFamily: string;
        fontSize: number;
        fontWeight: string;
        color: string;
        align: 'left' | 'center' | 'right';
    };
    role?: string;
    row?: number;
    col?: number;
    placeholderContent?: string;
    value?: string;
    is_header?: boolean;
}

export interface LayoutSchema {
    page: {
        width: 'A4' | 'LETTER' | 'LEGAL';
        unit: 'mm' | 'px';
        margins: { top: number; bottom: number; left: number; right: number };
    };
    pages: Array<{
        id: string;
        elements: TemplateElement[];
        backgroundImage?: string;
    }>;
}
