import { useState } from 'react';
import { AlertCircle, CheckCircle, UploadCloud, X } from 'lucide-react';
import api from '../services/api';

export default function ReimportModal({ isOpen, onClose, inventarioId, onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mapping, setMapping] = useState({
    sku: '',
    codigo_referencia: '',
    nome: '',
    categoria: '',
    saldo_erp: '',
    fator_conversao: '',
    unidade_medida: '',
    codigo_barras: '',
    localizacao: '',
    validade: '',
    preco_custo: '',
    preco_venda: ''
  });

  if (!isOpen) return null;

  const handleFileUpload = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    setError(null);
    setFile(selectedFile);

    const uploadData = new FormData();
    uploadData.append('file', selectedFile);

    try {
      setLoading(true);
      const response = await api.post('/import/upload', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setUploadedFilename(response.data.filename);
      setExcelHeaders(response.data.headers);

      const autoMap = { ...mapping };
      response.data.headers.forEach((header) => {
        const lowerHeader = header.toLowerCase();
        if ((lowerHeader.includes('sku') || lowerHeader.includes('interno')) && !lowerHeader.includes('barra')) autoMap.sku = header;
        if (lowerHeader.includes('referência') || lowerHeader.includes('fornecedor') || (lowerHeader.includes('código') && lowerHeader.includes('produto'))) autoMap.codigo_referencia = header;
        if (lowerHeader.includes('nome') || lowerHeader.includes('descrição')) autoMap.nome = header;
        if (lowerHeader.includes('saldo') || lowerHeader.includes('estoque')) autoMap.saldo_erp = header;
        if (lowerHeader.includes('fator') || lowerHeader.includes('convers')) autoMap.fator_conversao = header;
        if (lowerHeader.includes('unidade') || lowerHeader.includes('medida') || lowerHeader === 'un' || lowerHeader === 'um') autoMap.unidade_medida = header;
        if (lowerHeader.includes('barra') || lowerHeader.includes('ean')) autoMap.codigo_barras = header;
        if (lowerHeader.includes('local') || lowerHeader.includes('corredor')) autoMap.localizacao = header;
        if (lowerHeader.includes('validade') || lowerHeader.includes('vencimento')) autoMap.validade = header;
        if (lowerHeader.includes('categoria') || lowerHeader.includes('grupo') || lowerHeader.includes('departamento') || lowerHeader.includes('seção')) autoMap.categoria = header;
        if (lowerHeader.includes('custo') || (lowerHeader.includes('preço') && lowerHeader.includes('custo')) || (lowerHeader.includes('preco') && lowerHeader.includes('custo'))) autoMap.preco_custo = header;
        if (lowerHeader.includes('venda') || (lowerHeader.includes('preço') && lowerHeader.includes('venda')) || (lowerHeader.includes('preco') && lowerHeader.includes('venda'))) autoMap.preco_venda = header;
      });

      setMapping(autoMap);
    } catch (err) {
      setError(`Erro ao enviar arquivo. ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessImport = async () => {
    if (!mapping.sku) {
      setError('O mapeamento do SKU é obrigatório.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await api.post('/import/process', {
        filename: uploadedFilename,
        mapping,
        inventario_id: inventarioId
      });

      onImportSuccess(response.data);
      onClose();
    } catch (err) {
      setError(`Erro ao processar planilha. ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setUploadedFilename('');
    setExcelHeaders([]);
    setError(null);
    setMapping({
      sku: '',
      codigo_referencia: '',
      nome: '',
      categoria: '',
      saldo_erp: '',
      fator_conversao: '',
      unidade_medida: '',
      codigo_barras: '',
      localizacao: '',
      validade: '',
      preco_custo: '',
      preco_venda: ''
    });
  };

  const fieldLabels = {
    sku: 'SKU (Código Interno)',
    codigo_referencia: 'Código de Referência (Fornecedor)',
    codigo_barras: 'Código de Barras (EAN13)',
    nome: 'Nome do Produto',
    categoria: 'Categoria',
    saldo_erp: 'Saldo ERP',
    fator_conversao: 'Fator de Conversão',
    unidade_medida: 'Unidade de Medida',
    localizacao: 'Localização / Endereço',
    validade: 'Data de Validade',
    preco_custo: 'Preço de Custo (R$)',
    preco_venda: 'Preço de Venda (R$)',
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="relative flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="shrink-0 border-b border-slate-100 p-6 sm:px-10 sm:py-6">
          <button
            onClick={handleClose}
            className="absolute right-6 top-6 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Atualizar Planilha</h2>
          <p className="mt-2 text-sm text-slate-500">
            Envie uma nova planilha para adicionar produtos ou atualizar o saldo e fator de conversão dos produtos existentes neste inventário. As contagens já realizadas não serão perdidas.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:px-10 sm:pb-10">
          {!excelHeaders.length ? (
            <div className="rounded-[28px] border-2 border-dashed border-slate-300 bg-slate-50/70 p-10 text-center transition-colors hover:bg-slate-50">
              <input
                type="file"
                id="file-reupload"
                className="hidden"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
              />
              <label htmlFor="file-reupload" className="flex cursor-pointer flex-col items-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <span className="mt-5 text-lg font-semibold text-slate-900">
                  Clique para selecionar ou arraste a planilha
                </span>
                <span className="mt-2 text-sm text-slate-500">Formatos aceitos: `.xlsx`, `.xls` e `.csv`.</span>
              </label>
              {loading ? <div className="mt-5 text-sm font-medium text-indigo-600">Enviando e lendo arquivo...</div> : null}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-800">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Planilha carregada com sucesso</p>
                  <p className="mt-1 text-sm">
                    Arquivo: <span className="font-medium">{file?.name}</span>. Revise o mapeamento abaixo antes de confirmar.
                  </p>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5">
                  <h3 className="text-lg font-bold text-slate-900">Mapeamento de colunas</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Confirme quais colunas da planilha correspondem aos campos do sistema.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {Object.keys(mapping).map((field) => (
                    <div key={field}>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        {fieldLabels[field] || field} {field === 'sku' ? '*' : ''}
                      </label>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                        value={mapping[field]}
                        onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}
                      >
                        <option value="">-- Não mapear --</option>
                        {excelHeaders.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetState}
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Trocar arquivo
                </button>
                <button
                  type="button"
                  onClick={handleProcessImport}
                  disabled={loading || !mapping.sku}
                  className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Processando...' : 'Confirmar Atualização'}
                </button>
              </div>
            </div>
          )}

          {error ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-rose-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
