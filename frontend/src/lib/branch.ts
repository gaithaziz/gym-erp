export function getBranchParams(selectedBranchId: string): Record<string, string> {
    if (!selectedBranchId || selectedBranchId === 'all') {
        return {};
    }
    return { branch_id: selectedBranchId };
}

