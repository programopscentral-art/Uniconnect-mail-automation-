import * as XLSX from 'xlsx';

export function parseExcel(buffer: Buffer, sheetName?: string) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const targetSheet = sheetName || workbook.SheetNames[0];
    const worksheet = workbook.Sheets[targetSheet];
    if (!worksheet) throw new Error(`Sheet "${targetSheet}" not found.`);

    return XLSX.utils.sheet_to_json(worksheet);
}

export function getSheetNames(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    return workbook.SheetNames;
}
