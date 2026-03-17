/**
 * Lightweight i18n module for HB Scrub CLI messages.
 *
 * Usage:
 *   import { t, setLocale } from './i18n.js';
 *   setLocale('es');
 *   console.log(t('scrub.done', { count: 5 }));
 *   // => "5 archivo(s) procesados"
 *
 * Adding a language:
 *   Add a new entry to `messages` with the same keys as 'en'.
 */

export type Locale = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh';

interface MessageMap {
  [key: string]: string;
}

const messages: Record<Locale, MessageMap> = {
  en: {
    'app.name': 'HB Scrub',
    'app.tagline': 'Strip EXIF, GPS & metadata from your files — privately, locally',
    'app.privacy': 'All processing happens on this machine. No data leaves your computer.',
    'scrub.done': '{count} file(s) processed successfully',
    'scrub.error': 'Error processing {file}: {message}',
    'scrub.pending': 'Pending',
    'scrub.processing': 'Processing…',
    'scrub.clean': 'Clean',
    'verify.warn': 'verify: {file} still has [{types}] (confidence: {confidence})',
    'error.noInput': 'No input files or directories specified',
    'error.encrypted': 'Encrypted PDF detected — metadata removal requires prior decryption.',
    'stego.none': 'no steganography indicators detected',
    'diff.header': 'diff: {file}',
    'batch.blocked': 'Commit blocked: staged files contain metadata.',
  },
  es: {
    'app.name': 'HB Scrub',
    'app.tagline': 'Elimina EXIF, GPS y metadatos de tus archivos — privada y localmente',
    'app.privacy': 'Todo el procesamiento ocurre en esta máquina. Ningún dato sale de tu computadora.',
    'scrub.done': '{count} archivo(s) procesados exitosamente',
    'scrub.error': 'Error al procesar {file}: {message}',
    'scrub.pending': 'Pendiente',
    'scrub.processing': 'Procesando…',
    'scrub.clean': 'Limpio',
    'verify.warn': 'verificar: {file} aún tiene [{types}] (confianza: {confidence})',
    'error.noInput': 'No se especificaron archivos o directorios de entrada',
    'error.encrypted': 'PDF cifrado detectado — la eliminación de metadatos requiere descifrado previo.',
    'stego.none': 'no se detectaron indicadores de esteganografía',
    'diff.header': 'diferencias: {file}',
    'batch.blocked': 'Commit bloqueado: los archivos preparados contienen metadatos.',
  },
  fr: {
    'app.name': 'HB Scrub',
    'app.tagline': 'Supprimez les données EXIF, GPS et métadonnées de vos fichiers — en privé, localement',
    'app.privacy': 'Tout le traitement se fait sur cette machine. Aucune donnée ne quitte votre ordinateur.',
    'scrub.done': '{count} fichier(s) traité(s) avec succès',
    'scrub.error': 'Erreur lors du traitement de {file} : {message}',
    'scrub.pending': 'En attente',
    'scrub.processing': 'Traitement…',
    'scrub.clean': 'Propre',
    'verify.warn': 'vérifier : {file} contient encore [{types}] (confiance : {confidence})',
    'error.noInput': 'Aucun fichier ou répertoire d\'entrée spécifié',
    'error.encrypted': 'PDF chiffré détecté — la suppression des métadonnées nécessite un déchiffrement préalable.',
    'stego.none': 'aucun indicateur de stéganographie détecté',
    'diff.header': 'diff : {file}',
    'batch.blocked': 'Commit bloqué : les fichiers indexés contiennent des métadonnées.',
  },
  de: {
    'app.name': 'HB Scrub',
    'app.tagline': 'EXIF, GPS & Metadaten entfernen — privat und lokal',
    'app.privacy': 'Alle Verarbeitung findet auf diesem Gerät statt. Keine Daten verlassen Ihren Computer.',
    'scrub.done': '{count} Datei(en) erfolgreich verarbeitet',
    'scrub.error': 'Fehler bei der Verarbeitung von {file}: {message}',
    'scrub.pending': 'Ausstehend',
    'scrub.processing': 'Verarbeitung…',
    'scrub.clean': 'Sauber',
    'verify.warn': 'Überprüfung: {file} enthält noch [{types}] (Vertrauen: {confidence})',
    'error.noInput': 'Keine Eingabedateien oder -verzeichnisse angegeben',
    'error.encrypted': 'Verschlüsseltes PDF erkannt — Metadatenentfernung erfordert vorherige Entschlüsselung.',
    'stego.none': 'keine Steganographie-Indikatoren erkannt',
    'diff.header': 'Diff: {file}',
    'batch.blocked': 'Commit blockiert: Bereitgestellte Dateien enthalten Metadaten.',
  },
  ja: {
    'app.name': 'HB Scrub',
    'app.tagline': 'EXIF、GPS、メタデータをローカルで安全に削除',
    'app.privacy': 'すべての処理はこのマシンで行われます。データは外部に送信されません。',
    'scrub.done': '{count}個のファイルを正常に処理しました',
    'scrub.error': '{file}の処理中にエラー: {message}',
    'scrub.pending': '保留中',
    'scrub.processing': '処理中…',
    'scrub.clean': 'クリーン',
    'verify.warn': '検証: {file}にまだ[{types}]が残っています（信頼度: {confidence}）',
    'error.noInput': '入力ファイルまたはディレクトリが指定されていません',
    'error.encrypted': '暗号化されたPDFを検出 — メタデータの削除には事前の復号化が必要です。',
    'stego.none': 'ステガノグラフィーの指標は検出されませんでした',
    'diff.header': '差分: {file}',
    'batch.blocked': 'コミットがブロックされました：ステージングされたファイルにメタデータが含まれています。',
  },
  zh: {
    'app.name': 'HB Scrub',
    'app.tagline': '私密地、本地地从文件中删除EXIF、GPS和元数据',
    'app.privacy': '所有处理都在本机进行。没有数据离开您的计算机。',
    'scrub.done': '成功处理了{count}个文件',
    'scrub.error': '处理{file}时出错：{message}',
    'scrub.pending': '待处理',
    'scrub.processing': '处理中…',
    'scrub.clean': '干净',
    'verify.warn': '验证：{file}仍包含[{types}]（置信度：{confidence}）',
    'error.noInput': '未指定输入文件或目录',
    'error.encrypted': '检测到加密PDF — 删除元数据需要先解密。',
    'stego.none': '未检测到隐写术指标',
    'diff.header': '差异：{file}',
    'batch.blocked': '提交被阻止：暂存的文件包含元数据。',
  },
};

let currentLocale: Locale = 'en';

/** Set the active locale */
export function setLocale(locale: Locale): void {
  if (messages[locale]) {
    currentLocale = locale;
  }
}

/** Get the active locale */
export function getLocale(): Locale {
  return currentLocale;
}

/** Get available locales */
export function getAvailableLocales(): Locale[] {
  return Object.keys(messages) as Locale[];
}

/**
 * Translate a message key, interpolating `{placeholder}` tokens from `vars`.
 * Falls back to English if the key is missing from the current locale.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const msg = messages[currentLocale]?.[key] ?? messages.en[key] ?? key;
  if (!vars) return msg;
  return msg.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
