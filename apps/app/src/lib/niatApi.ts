/**
 * NIAT API Client
 * Hardcoded production URL for direct integration.
 */
export const API_BASE = "https://uniconnect-mail-automation-production-16cf.up.railway.app";

export async function inspectWorkbook(file: File): Promise<{ sheets: string[] }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE}/inspect`, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        let errorMessage = "Failed to inspect workbook";
        try {
            const data = await response.json();
            errorMessage = data.detail || errorMessage;
        } catch (e) {
            // Use default message
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

export async function generatePlan(
    calendarFile: File,
    prodFile: File,
    calendarSheetName?: string,
    config?: object
): Promise<Blob> {
    const formData = new FormData();
    formData.append("calendar_file", calendarFile);
    formData.append("prod_sequence_file", prodFile);
    if (calendarSheetName) {
        formData.append("calendar_sheet_name", calendarSheetName);
    }
    if (config) {
        formData.append("config", JSON.stringify(config));
    }

    const response = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        let errorMessage = "Failed to generate NIAT plan";
        try {
            const data = await response.json();
            errorMessage = data.detail || errorMessage;
        } catch (e) {
            // Use default message
        }
        throw new Error(errorMessage);
    }

    return response.blob();
}
