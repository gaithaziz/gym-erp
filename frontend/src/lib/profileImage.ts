const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:8000';
const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, '');
const apiOrigin = normalizedApiUrl.endsWith('/api/v1')
    ? normalizedApiUrl.slice(0, -'/api/v1'.length)
    : normalizedApiUrl;

export function resolveProfileImageUrl(profilePictureUrl?: string | null): string | undefined {
    if (!profilePictureUrl) return undefined;

    const trimmed = profilePictureUrl.trim();
    if (!trimmed) return undefined;

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${apiOrigin}${path}`;
}
