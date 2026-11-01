// 038 NFR-07: a foreign, deleted or unknown project id gets this same 404 body
// on every surface, so the response is not an existence oracle.
export const PROJECT_NOT_FOUND = { error: 'Project not found', code: 'PROJECT_NOT_FOUND' } as const
