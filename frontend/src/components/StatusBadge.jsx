const LABELS = {
    idle: { text: "Ready", cls: "idle" },
    proving_a: { text: "VASP_A proving…", cls: "running" },
    submitting_a: { text: "Submitting…", cls: "running" },
    pending_b: { text: "Awaiting VASP_B", cls: "pending" },
    proving_b: { text: "VASP_B proving…", cls: "running" },
    submitting_b: { text: "Submitting…", cls: "running" },
    cleared: { text: "Cleared ✓", cls: "cleared" },
    rejected: { text: "Rejected", cls: "rejected" },
    failed: { text: "Failed", cls: "failed" },
};

export default function StatusBadge({ phase }) {
    const { text, cls } = LABELS[phase] ?? LABELS.idle;
    return <div className={`status-badge status-${cls}`}>{text}</div>;
}
