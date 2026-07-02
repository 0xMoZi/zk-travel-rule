const STEP_ICONS = { done: "✓", running: "…", pending: "○", rejected: "✕" };

export default function VaspPanel({
    role,
    label,
    name,
    nationality,
    logs,
    phase,
    txHash,
    onTransfer,
    onApprove,
    onReject,
    isPendingApproval,
    disabled,
    willFail,
}) {
    const isA = role === "A";
    const idle = phase === "idle";

    return (
        <div
            className={`vasp-panel vasp-${role.toLowerCase()} ${logs.length > 0 ? "active" : ""}`}
        >
            <div className="vasp-header">
                <span className="vasp-badge">{role}</span>
                <div>
                    <p className="vasp-label">{label}</p>
                    <p className="vasp-customer">
                        {name} · {nationality}
                    </p>
                </div>
            </div>

            {isA && idle && (
                <div className="transfer-form">
                    {willFail && (
                        <p className="fail-warning">
                            ⚠ This sender will fail on-chain — prohibited
                            jurisdiction (C3 check)
                        </p>
                    )}
                    <button
                        className="btn-primary"
                        onClick={onTransfer}
                        disabled={disabled}
                    >
                        Initiate transfer →
                    </button>
                </div>
            )}

            {isA && !idle && logs.length === 0 && (
                <p className="vasp-waiting">Waiting…</p>
            )}

            {logs.length > 0 && (
                <ul className="log-list">
                    {logs.map((entry) => (
                        <li
                            key={entry.id}
                            className={`log-item log-${entry.status}`}
                        >
                            <span className="log-icon">
                                {STEP_ICONS[entry.status] ?? "·"}
                            </span>
                            <span className="log-msg">{entry.msg}</span>
                        </li>
                    ))}
                </ul>
            )}

            {!isA && isPendingApproval && (
                <div className="approval-box">
                    <p className="approval-title">Incoming intent</p>
                    <p className="approval-sub">
                        From VASP_A · Generate ZK proof and counter-sign?
                    </p>
                    <div className="approval-actions">
                        <button className="btn-primary" onClick={onApprove}>
                            Approve & sign
                        </button>
                        <button className="btn-ghost" onClick={onReject}>
                            Reject
                        </button>
                    </div>
                </div>
            )}

            {txHash && (
                <a
                    className="tx-link"
                    href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    View tx ↗
                </a>
            )}
        </div>
    );
}
