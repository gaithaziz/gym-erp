import { z } from "zod";

const standardResponseSchema = z.object({
  data: z.unknown().nullable().optional(),
  message: z.string().nullable().optional(),
  success: z.boolean().default(true),
});

export type StandardResponse<T> = {
  data?: T | null;
  message?: string | null;
  success: boolean;
};

export type PaginatedListMeta = {
  totalCount: number | null;
};

type HeaderLike =
  | Headers
  | Record<string, string | null | undefined>;

function readHeader(headers: HeaderLike | undefined, key: string): string | null {
  if (!headers) return null;
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(key);
  }
  const match = Object.entries(headers).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
  return match?.[1] ?? null;
}

export function parseStandardResponse<T>(input: unknown): StandardResponse<T> {
  return standardResponseSchema.parse(input) as StandardResponse<T>;
}

export function parsePaginatedListResponse<T>(
  input: unknown,
  headers?: HeaderLike,
): { items: T[]; meta: PaginatedListMeta } {
  const envelope = parseStandardResponse<unknown>(input);
  const items = Array.isArray(envelope.data) ? (envelope.data as T[]) : [];
  const rawTotalCount = readHeader(headers, "X-Total-Count");
  const totalCount = rawTotalCount === null ? null : Number(rawTotalCount);

  return {
    items,
    meta: {
      totalCount: Number.isFinite(totalCount) ? totalCount : null,
    },
  };
}
