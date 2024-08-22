export namespace Exception {
  export const create = (error?: unknown) =>
    !error
      ? new Error("An unknown error occurred!")
      : error instanceof Error
      ? error
      : new Error(error.toString());

  export const response = (error?: unknown) =>
    new Response(create(error).message, { status: 500 });

  export const tryCatchRequest = async <R,>(execute: () => R) => {
    try {
      return await execute();
    } catch (error) {
      console.error(error);
      return response(error);
    }
  };
}
