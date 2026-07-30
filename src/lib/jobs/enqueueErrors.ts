// Enqueue error codes shared between the server action and the route handler.
// Must NOT be in a 'use server' file (server action files cannot export non-functions).

// Thrown by enqueueJob when fn_enqueue_job returns P0007 on both the first attempt
// and one immediate server retry. The route catches this and returns HTTP 503
// { code: 'JOB_ENQUEUE_RETRY_REQUIRED' }. The client must preserve the request key
// and show a safe retry message.
export const ENQUEUE_RETRY_REQUIRED = 'ENQUEUE_RETRY_REQUIRED' as const
