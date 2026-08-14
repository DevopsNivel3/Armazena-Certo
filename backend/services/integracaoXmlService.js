const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const toIso = (value) => new Date(value || Date.now()).toISOString();

function buildInboundExportXml({ lote, notas, exportacaoCodigo, generatedAt = new Date() }) {
  const validNotes = (notas || []).filter((nota) => nota.status === 'ok');
  if (!validNotes.length) throw new Error('O lote nao possui NF-es OK para exportacao.');

  const rows = validNotes.map((nota) => {
    const xmlBase64 = Buffer.from(String(nota.xml_original || ''), 'utf8').toString('base64');
    return [
      '    <nfe>',
      `      <chaveAcesso>${escapeXml(nota.chave_acesso)}</chaveAcesso>`,
      `      <numero>${escapeXml(nota.numero_nfe)}</numero>`,
      `      <serie>${escapeXml(nota.serie)}</serie>`,
      `      <emitente cnpj="${escapeXml(nota.emitente_cnpj)}">${escapeXml(nota.emitente_nome)}</emitente>`,
      `      <destinatario cnpj="${escapeXml(nota.destinatario_cnpj)}">${escapeXml(nota.destinatario_nome)}</destinatario>`,
      `      <quantidadeVolumes>${escapeXml(nota.qtd_volumes_xml)}</quantidadeVolumes>`,
      `      <arquivo nome="${escapeXml(nota.arquivo_nome)}" encoding="base64">${xmlBase64}</arquivo>`,
      '    </nfe>'
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<pacoteRoteirizacao versao="1.0">',
    '  <identificacao>',
    `    <codigoExportacao>${escapeXml(exportacaoCodigo)}</codigoExportacao>`,
    `    <geradoEm>${toIso(generatedAt)}</geradoEm>`,
    `    <loteId>${escapeXml(lote.id)}</loteId>`,
    `    <loteNome>${escapeXml(lote.nome)}</loteNome>`,
    `    <doca>${escapeXml(lote.doca)}</doca>`,
    `    <origem>${escapeXml(lote.origem)}</origem>`,
    `    <quantidadeNotas>${validNotes.length}</quantidadeNotas>`,
    '  </identificacao>',
    '  <notasFiscais>',
    rows,
    '  </notasFiscais>',
    '</pacoteRoteirizacao>'
  ].join('\n');
}

module.exports = { buildInboundExportXml, escapeXml };
