export async function inspectWorkbook(apiBase: string, file: File): Promise<{ sheets: string[] }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${apiBase.replace(/\/$/, "")}/inspect`, {
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

export async function generateNiatPlan(params: {
    apiBase: string;
    calendarFile: File;
    prodSequenceFile: File;
    calendarSheetName: string;
    config: any;
}): Promise<Blob> {
    const formData = new FormData();
    formData.append("calendar_file", params.calendarFile);
    formData.append("prod_sequence_file", params.prodSequenceFile);
    formData.append("calendar_sheet_name", params.calendarSheetName);
    formData.append("config", JSON.stringify(params.config));

    const response = await fetch(`${params.apiBase.replace(/\/$/, "")}/generate`, {
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
