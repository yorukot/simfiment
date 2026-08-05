import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => {
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        return status >= 400 && status < 500 ? false : count < 2;
      },
      staleTime: 20_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

