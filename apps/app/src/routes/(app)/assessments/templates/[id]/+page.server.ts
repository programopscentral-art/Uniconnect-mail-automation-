import { error } from "@sveltejs/kit";
import { getAssessmentTemplateById, getUniversityAssets } from "@uniconnect/shared";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
    const { id } = params;
    const user = locals.user;

    if (!user) {
        throw error(401, "Unauthorized");
    }

    const template = await getAssessmentTemplateById(id);

    if (!template) {
        throw error(404, "Template not found");
    }

    // SECURITY CHECK: Hard Isolation
    const canAccess =
        user.role === "ADMIN" ||
        user.role === "PROGRAM_OPS" ||
        user.university_id === template.university_id;

    if (!canAccess) {
        throw error(403, "Forbidden: You do not have access to this template");
    }

    // Fetch university assets for the Design Studio library
    const assets = await getUniversityAssets(template.university_id);

    return {
        template,
        assets
    };
};
