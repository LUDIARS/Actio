interface InfisicalSetupPageProps { onComplete: () => void }

/** Compatibility notice when connecting to an older backend requesting setup. */
export function InfisicalSetupPage({ onComplete }: InfisicalSetupPageProps) {
  return <main style={{ padding: "2rem" }}>
    <h1>Actio の接続設定</h1>
    <p>ローカル設定は暗号化config、サービスの接続先と認証情報はExcubitorで管理します。</p>
    <p>ブラウザでのInfisical接続設定は終了しました。管理者が設定を更新してから再読み込みしてください。</p>
    <button onClick={onComplete}>Actio に戻る</button>
  </main>;
}
