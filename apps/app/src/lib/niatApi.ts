import { env } from '$env/dynamic/public';

/**
 * API_BASE is resolved from PUBLIC_NIAT_API_URL dynamically.
 * Dynamic variables are read at runtime, which is better for Docker/Railway.
 */
export const getApiBase = () => {
    return (env.PUBLIC_NIAT_API_URL || "").replace(/\/$/, "");
};

export async function inspectWorkbook(file: File, overrideBase?: string): Promise<{ sheets: string[] }> {
    const base = overrideBase || getApiBase();
    if (!base) {
        throw new Error("NIAT API URL not configured. Contact admin.");
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${base}/inspect`, {
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
    config?: object,
    overrideBase?: string
): Promise<Blob> {
    const base = overrideBase || getApiBase();
    if (!base) {
        throw new Error("NIAT API URL not configured. Contact admin.");
    }

    const formData = new FormData();
    formData.append("calendar_file", calendarFile);
    formData.append("prod_sequence_file", prodFile);
    if (calendarSheetName) {
        formData.append("calendar_sheet_name", calendarSheetName);
    }
    if (config) {
        formData.append("config", JSON.stringify(config));
    }

    const response = await fetch(`${base}/generate`, {
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
