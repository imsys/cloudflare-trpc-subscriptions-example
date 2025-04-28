import z from "zod";

export namespace SSE {
  export type Events<
    E extends {
      event: string;
      data: unknown;
    } = Event.Base
  > = Event<E>[];

  export type Event<
    E extends {
      event: string;
      data: unknown;
    } = Event.Base
  > = E;

  export namespace Event {
    export type Base = zInfer<typeof Base.schema>;
    export namespace Base {
      export const schema = lazy(() =>
        z.object({
          event: z.string(),
          data: z.string(),
        })
      );
    }

    export type Raw = zInfer<typeof Raw.schema>;
    export namespace Raw {
      export const schema = lazy(() =>
        z
          .string()
          .transform((string) =>
            string.split("\n").reduce((event, line) => {
              const [key, ...rest] = line.split(":");
              if (!key) return event;

              const value = rest.join(":").trim();
              return { ...event, [key]: value };
            }, {})
          )
          .pipe(Base.schema())
      );
    }
  }

  export async function handle<Schema extends z.ZodTypeAny>(
    response: Response,
    schema: Schema
  ): Promise<Events | Error> {
    if (!response.body) return Error("No response body was provided.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const events = [];
    let text = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) return events;

      const chunk = decoder.decode(value, { stream: true });
      text += chunk;

      if (!text.endsWith("\n\n")) continue;

      const rawEvents = text.trim().split("\n\n");

      for (const rawEvent of rawEvents) {
        const parsed = Event.Raw.schema().pipe(schema).safeParse(rawEvent);
        if (!parsed.success) return parsed.error;

        events.push(parsed.data);
      }

      text = "";
    }
  }
}
