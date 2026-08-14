import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  FileSpreadsheet,
  Package,
  Plus,
  Search,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';

const stepItems = [
  { step: 1, title: 'Informações', description: 'Defina nome, data e contexto', icon: Package },
  { step: 2, title: 'Usuários', description: 'Escolha quem participa', icon: Users },
  { step: 3, title: 'Planilha', description: 'Importe e mapeie os dados', icon: FileSpreadsheet },
];

export default function CreateInventory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    data_inicio: new Date().toISOString().split('T')[0],
    observacoes: '',
    validade_obrigatoria: true,
    empresa_cliente_nome: '',
    empresa_cliente_cnpj: '',
    empresa_cliente_filial: '',
    empresa_cliente_endereco: '',
    locais_contagem: ['Picking', 'Pulmão']
  });
  const [newLocal, setNewLocal] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({ nome: '', email: '', senha: '', nivel_acesso: 'operador' });
  const [file, setFile] = useState(null);
  const [uploadedFilename, setUploadedFilename] = useState('');
  const [excelHeaders, setExcelHeaders] = useState([]);
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
    preco_venda: '',
  });

  useEffect(() => {
    if (step === 2 && users.length === 0) {
      loadUsers();
    }
  }, [step, users.length]);

  async function loadUsers() {
    try {
      const response = await api.get('/usuarios');
      setUsers(response.data);
    } catch (err) {
      setError(`Erro ao carregar usuários. ${err.response?.data?.message || err.message}`);
    }
  }

  async function handleAddUser(event) {
    event.preventDefault();

    try {
      setAddingUser(true);
      setError(null);
      const payload = {
        ...newUser,
        empresa_id: user.empresa_id,
      };
      const response = await api.post('/usuarios', payload);
      
      // Select the newly created user automatically
      const createdUserId = response.data.id || response.data.usuario?.id;
      
      setShowAddUserModal(false);
      setNewUser({ nome: '', email: '', senha: '', nivel_acesso: 'operador' });
      await loadUsers();
      
      if (createdUserId) {
        setSelectedUsers(prev => [...prev, createdUserId]);
      }
    } catch (error) {
      console.error('Error adding user:', error);
      setError(error.response?.data?.error || error.response?.data?.message || 'Nao foi possivel criar o operador.');
    } finally {
      setAddingUser(false);
    }
  }

  async function handleFileUpload(event) {
    const selectedFile = event.target.files[0];
    if (!selectedFile) {
      return;
    }

    setError(null);
    setFile(selectedFile);

    const uploadData = new FormData();
    uploadData.append('file', selectedFile);

    try {
      setLoading(true);
      const response = await api.post('/import/upload', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
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
  }

  async function handleCreate() {
    if (!formData.nome || !mapping.sku) {
      setError('Preencha os campos obrigatórios: nome do inventário e mapeamento do SKU.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const inventoryResponse = await api.post('/inventories', {
        ...formData,
        usuarios: selectedUsers,
      });
      const newInventoryId = inventoryResponse.data.id;

      if (uploadedFilename) {
        await api.post('/import/process', {
          filename: uploadedFilename,
          mapping,
          inventario_id: newInventoryId,
        });
      }

      navigate(`/inventarios/${newInventoryId}`);
    } catch (err) {
      setError(`Erro ao criar inventário. ${err.response?.data?.message || err.message}`);
      setLoading(false);
    }
  }

  function toggleUser(userId) {
    setSelectedUsers((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  }

  const mappedFieldsCount = Object.values(mapping).filter(Boolean).length;

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

  const renderStep1 = () => (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Etapa 1</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Informações básicas</h2>
        <p className="mt-2 text-sm text-slate-500">
          Defina o nome da operação, a data de início e registre observações úteis para a equipe.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-slate-700">Nome do inventário *</label>
          <input
            type="text"
            required
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
            value={formData.nome}
            onChange={(event) => setFormData({ ...formData, nome: event.target.value })}
            placeholder="Ex: Inventário geral da loja matriz"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Data de início</label>
          <input
            type="date"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
            value={formData.data_inicio}
            onChange={(event) => setFormData({ ...formData, data_inicio: event.target.value })}
          />
        </div>

        <div className="lg:col-span-2 mt-2">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2 mb-4">Informações da Empresa/Cliente (Opcional)</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Nome da Empresa</label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                value={formData.empresa_cliente_nome}
                onChange={(event) => setFormData({ ...formData, empresa_cliente_nome: event.target.value })}
                placeholder="Razão Social ou Fantasia"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">CNPJ</label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                value={formData.empresa_cliente_cnpj}
                onChange={(event) => setFormData({ ...formData, empresa_cliente_cnpj: event.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Filial/Loja</label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                value={formData.empresa_cliente_filial}
                onChange={(event) => setFormData({ ...formData, empresa_cliente_filial: event.target.value })}
                placeholder="Ex: Matriz, Loja 01"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Endereço</label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                value={formData.empresa_cliente_endereco}
                onChange={(event) => setFormData({ ...formData, empresa_cliente_endereco: event.target.value })}
                placeholder="Rua, Número, Cidade - UF"
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 mt-4 border-t border-slate-100 pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 mb-4">Locais de Contagem (Setores/Áreas)</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {formData.locais_contagem.map((local, index) => (
              <div key={index} className="inline-flex items-center rounded-xl bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">
                {local}
                <button
                  type="button"
                  onClick={() => setFormData({
                    ...formData,
                    locais_contagem: formData.locais_contagem.filter((_, i) => i !== index)
                  })}
                  className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-indigo-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center max-w-sm gap-2">
            <input
              type="text"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
              value={newLocal}
              onChange={(e) => setNewLocal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (newLocal.trim() && !formData.locais_contagem.includes(newLocal.trim())) {
                    setFormData({
                      ...formData,
                      locais_contagem: [...formData.locais_contagem, newLocal.trim()]
                    });
                    setNewLocal('');
                  }
                }
              }}
              placeholder="Adicionar novo local (Ex: Prateleira A)"
            />
            <button
              type="button"
              onClick={() => {
                if (newLocal.trim() && !formData.locais_contagem.includes(newLocal.trim())) {
                  setFormData({
                    ...formData,
                    locais_contagem: [...formData.locais_contagem, newLocal.trim()]
                  });
                  setNewLocal('');
                }
              }}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700"
            >
              Adicionar
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 mt-4 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Resumo</p>
          <p className="mt-3 text-sm text-slate-600">
            Este inventário será criado como base da operação e poderá receber usuários e planilha de estoque na sequência.
          </p>
        </div>

        <div className="lg:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-slate-700">Observações</label>
          <textarea
            className="min-h-[140px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
            value={formData.observacoes}
            onChange={(event) => setFormData({ ...formData, observacoes: event.target.value })}
            placeholder="Detalhes importantes, área de cobertura, regras da contagem ou observações operacionais..."
          />
        </div>
      </div>

      <div className="flex items-center mt-6">
        <input
          id="validade_obrigatoria"
          type="checkbox"
          className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          checked={formData.validade_obrigatoria}
          onChange={(e) => setFormData({ ...formData, validade_obrigatoria: e.target.checked })}
        />
        <label htmlFor="validade_obrigatoria" className="ml-3 block text-sm font-semibold text-slate-900">
          Validade Obrigatória?
        </label>
      </div>
      <p className="mt-1 text-sm text-slate-500 ml-8">
        Se marcado, todos os operadores serão obrigados a preencher a data de validade ao bipar os produtos.
      </p>

      <div className="flex justify-end border-t border-slate-100 pt-6 mt-8">
        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={!formData.nome}
          className="inline-flex items-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 disabled:opacity-50"
        >
          Próxima etapa
          <ArrowRight className="ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const filteredUsers = users.filter((user) => 
    user.nome.toLowerCase().includes(userSearchTerm.toLowerCase()) || 
    user.email.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const renderStep2 = () => (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Etapa 2</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Permissões de acesso</h2>
          <p className="mt-2 text-sm text-slate-500">
            Escolha os usuários que poderão acessar e registrar contagens neste inventário.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">
            {selectedUsers.length} usuário(s) selecionado(s)
          </div>
          <button
            type="button"
            onClick={() => setShowAddUserModal(true)}
            className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo Operador
          </button>
        </div>
      </div>

      <div className="relative w-full max-w-md">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
          <Search className="h-5 w-5" />
        </div>
        <input
          type="text"
          placeholder="Buscar usuário por nome ou email..."
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
          value={userSearchTerm}
          onChange={(e) => setUserSearchTerm(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Acesso</th>
              <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Usuário</th>
              <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Perfil</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((user) => (
              <tr
                key={user.id}
                className="cursor-pointer transition-colors hover:bg-slate-50"
                onClick={() => toggleUser(user.id)}
              >
                <td className="px-6 py-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    checked={selectedUsers.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                  />
                </td>
                <td className="px-6 py-4">
                  <div className="font-semibold text-slate-900">{user.nome}</div>
                  <div className="text-sm text-slate-500">{user.email}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100">
                    {user.nivel_acesso}
                  </span>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="3" className="px-6 py-10 text-center text-sm text-slate-500">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col-reverse justify-between gap-3 border-t border-slate-100 pt-6 sm:flex-row">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </button>
        <button
          type="button"
          onClick={() => setStep(3)}
          className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700"
        >
          Próxima etapa
          <ArrowRight className="ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Etapa 3</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Importação de estoque</h2>
          <p className="mt-2 text-sm text-slate-500">
            Envie a planilha do ERP para vincular produtos, saldos e fatores de conversão.
          </p>
        </div>
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {mappedFieldsCount} campo(s) mapeado(s)
        </div>
      </div>

      {!excelHeaders.length ? (
        <div className="rounded-[28px] border-2 border-dashed border-slate-300 bg-slate-50/70 p-10 text-center transition-colors hover:bg-slate-50">
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileUpload}
          />
          <label htmlFor="file-upload" className="flex cursor-pointer flex-col items-center">
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
                Arquivo: <span className="font-medium">{file?.name}</span>. Revise o mapeamento abaixo antes de finalizar.
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
                  {field === 'fator_conversao' ? (
                    <p className="mt-2 text-xs text-slate-500">Ex.: quantidade de itens por caixa ou volume.</p>
                  ) : null}
                  {field === 'saldo_erp' ? (
                    <p className="mt-2 text-xs text-slate-500">Corresponde ao saldo atual vindo do ERP.</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-rose-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : null}

      <div className="flex flex-col-reverse justify-between gap-3 border-t border-slate-100 pt-6 sm:flex-row">
        <button
          type="button"
          onClick={() => setStep(2)}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading || (uploadedFilename && !mapping.sku)}
          className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? 'Criando...' : 'Finalizar e criar inventário'}
          <CheckCircle className="ml-2 h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-100">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <section className="overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 shadow-2xl shadow-slate-300/30">
              <div className="grid gap-8 px-6 py-7 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
                <div>
                  <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                    Novo inventário
                  </div>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Monte a operação em etapas claras e sem atrito.
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                    Cadastre o inventário, defina quem participa e importe a base do ERP com um fluxo mais simples e profissional.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Etapa atual</p>
                    <p className="mt-3 text-3xl font-bold text-white">{step}/3</p>
                    <p className="mt-2 text-sm text-slate-300">{stepItems.find((item) => item.step === step)?.title}</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Usuários</p>
                    <p className="mt-3 text-3xl font-bold text-white">{selectedUsers.length}</p>
                    <p className="mt-2 text-sm text-slate-300">Pessoas com acesso à contagem.</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Importação</p>
                    <p className="mt-3 text-3xl font-bold text-white">{uploadedFilename ? 'OK' : '—'}</p>
                    <p className="mt-2 text-sm text-slate-300">Base ERP pronta para processamento.</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.34fr_1fr]">
              <aside className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Fluxo guiado</p>
                <div className="mt-5 space-y-4">
                  {stepItems.map((item) => {
                    const active = step === item.step;
                    const completed = step > item.step;
                    const Icon = item.icon;

                    return (
                      <button
                        key={item.step}
                        type="button"
                        onClick={() => setStep(item.step)}
                        className={`flex w-full items-start gap-4 rounded-3xl border px-4 py-4 text-left transition-all ${
                          active
                            ? 'border-indigo-200 bg-indigo-50'
                            : completed
                              ? 'border-emerald-200 bg-emerald-50/60'
                              : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                            active
                              ? 'bg-indigo-600 text-white'
                              : completed
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white text-slate-500 ring-1 ring-slate-200'
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="rounded-[28px] border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
                {step === 1 ? renderStep1() : null}
                {step === 2 ? renderStep2() : null}
                {step === 3 ? renderStep3() : null}
              </section>
            </section>
          </div>
        </main>
      </div>

      {/* Modal Add User */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-xl overflow-hidden">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 p-6">
              <h3 className="text-lg font-bold text-slate-900">Novo Operador</h3>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nome completo</label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    value={newUser.nome}
                    onChange={(e) => setNewUser({ ...newUser, nome: e.target.value })}
                    placeholder="Nome do operador"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="operador@empresa.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Senha de acesso</label>
                  <input
                    type="password"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    value={newUser.senha}
                    onChange={(e) => setNewUser({ ...newUser, senha: e.target.value })}
                    placeholder="Senha segura"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nível de acesso</label>
                  <select
                    value={newUser.nivel_acesso}
                    onChange={(e) => setNewUser({ ...newUser, nivel_acesso: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  >
                    <option value="operador">Operador (Apenas Conta)</option>
                    <option value="admin_inventario">Admin do Inventário (Acesso Total)</option>
                  </select>
                </div>
                <div className="pt-4 flex flex-col-reverse sm:flex-row justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={addingUser}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {addingUser ? 'Criando...' : 'Criar e Selecionar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
