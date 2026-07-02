export default function ResultPanel({
    phase,
    error,
    intentId,
    txHashA,
    txHashB,
    onReset,
}) {
    const isCleared = phase === "cleared";
    const isRejected = phase === "rejected";
    const isFailed = phase === "failed";

    return (
        <div className={`result-panel result-${phase}`}>
            {isCleared && (
                <>
                    <p className="result-title">Intent Cleared</p>
                    <p className="result-sub">
                        Both VASPs verified their ZK proofs. Travel Rule
                        satisfied.
                    </p>
                    <div className="result-links">
                        {txHashA && (
                            <a
                                href={`https://stellar.expert/explorer/testnet/tx/${txHashA}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                submit_intent tx ↗
                            </a>
                        )}
                        {txHashB && (
                            <a
                                href={`https://stellar.expert/explorer/testnet/tx/${txHashB}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                counter_sign tx ↗
                            </a>
                        )}
                    </div>
                    {intentId && (
                        <code className="result-code">
                            intent_id: {intentId}
                        </code>
                    )}
                </>
            )}
            {isRejected && (
                <>
                    <p className="result-title">Intent Rejected</p>
                    <p className="result-sub">VASP_B declined the transfer.</p>
                </>
            )}
            {isFailed && error && (
                <>
                    <p className="result-title">Failed: {error.name}</p>
                    <p className="result-sub">{error.msg}</p>
                </>
            )}
            <button className="btn-ghost" onClick={onReset}>
                Run another scenario
            </button>
        </div>
    );
}
