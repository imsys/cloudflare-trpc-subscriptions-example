import * as ReactQuery from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";

import { TRPC } from "~/TRPC";

export namespace Client {
  export const get = lazy(() => createTRPCReact<TRPC>());

  export function Provider({ children }: WithChildren) {
    const { Provider } = get();

    const [queryClient] = useState(() => new ReactQuery.QueryClient());
    const [trpcClient] = useState(() =>
      get().createClient({
        links: [httpBatchLink({ url: import.meta.env.VITE_TRPC_URL })],
      })
    );

    return (
      <Provider client={trpcClient} queryClient={queryClient}>
        <ReactQuery.QueryClientProvider client={queryClient}>
          {children}
        </ReactQuery.QueryClientProvider>
      </Provider>
    );
  }
}
