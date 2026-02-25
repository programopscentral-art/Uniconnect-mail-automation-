/**
 * NIAT API Client
 * This client communicates with the Python-based NIAT Planner engine.
 */

// We use the exact URL that was confirmed working in previous sessions.
// If ERR_SSL_PROTOCOL_ERROR occurs, it is likely a temporary Railway deployment glitch.
export const API_BASE = "https://uniconnect-mail-automation-production-16cf.up.railway.app";

export async function inspectWorkbook(file: File): Promise<{ sheets: string[] }> {
    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch(`${API_BASE}/inspect`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            let errorMessage = "Failed to inspect workbook";
            try {
                const data = await response.json();
                errorMessage = data.detail || errorMessage;
            } catch (e) { }
            throw new Error(errorMessage);
        }

        return response.json();
    } catch (e: any) {
        console.error("NIAT_INSPECT_ERROR:", e);
        if (e.message.includes("Failed to fetch")) {
            throw new Error("Backend is temporarily offline or deploying. Please wait 2 minutes.");
        }
        throw e;
    }
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

    try {
        const response = await fetch(`${API_BASE}/generate`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            let errorMessage = "Failed to generate NIAT plan";
            try {
                const data = await response.json();
                errorMessage = data.detail || errorMessage;
            } catch (e) { }
            throw new Error(errorMessage);
        }

        return response.blob();
    } catch (e: any) {
        console.error("NIAT_GENERATE_ERROR:", e);
        if (e.message.includes("Failed to fetch")) {
            throw new Error("Backend connection failed. Service may be restarting. Please try again in 1 minute.");
        }
        throw e;
    }
}
