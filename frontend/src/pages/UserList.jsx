import { useEffect, useState } from 'react';
import {
  Check,
  Edit,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
  X,
  History,
  Package,
} from 'lucide-react';
import api from '../services/api';
import Sidebar from '../components/Sidebar';

const ROLE_STYLES = {
  admin: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  gerente: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  operador: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
};

const formatNumber = (value) => Number(value || 0).toLocaleString('pt-BR');

export default function UserList() {
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [userHistory, setUserHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedUserForHistory, setSelectedUserForHistory] = useState(null);

  const [feedback, setFeedback] = useState('');
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    nivel_acesso: 'operador',
    empresa_id: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [usersResponse, companiesResponse] = await Promise.all([api.get('/usuarios'), api.get('/empresas')]);
      setUsers(usersResponse.data);
      setCompanies(companiesResponse.data);

      if (companiesResponse.data.length > 0) {
        setFormData((current) => ({ ...current, empresa_id: companiesResponse.data[0].id }));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setFeedback('Não foi possível carregar os dados de usuários.');
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const response = await api.get('/usuarios');
      setUsers(response.data);
    } catch (error) {
      console.error('Error loading users:', error);
      setFeedback('Não foi possível atualizar a lista de usuários.');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Tem certeza que deseja excluir este usuário?')) {
      return;
    }

    try {
      await api.delete(`/usuarios/${id}`);
      setUsers((current) => current.filter((user) => user.id !== id));
      setFeedback('Usuário excluído com sucesso.');
    } catch (error) {
      console.error('Error deleting user:', error);
      setFeedback('Erro ao excluir usuário.');
    }
  }

  function handleEdit(user) {
    setCurrentUser(user);
    setFormData({
      nome: user.nome,
      email: user.email,
      senha: '',
      nivel_acesso: user.nivel_acesso,
      empresa_id: user.empresa_id || (companies.length > 0 ? companies[0].id : ''),
    });
    setShowModal(true);
  }

  function handleAddNew() {
    setCurrentUser(null);
    setFormData({
      nome: '',
      email: '',
      senha: '',
      nivel_acesso: 'operador',
      empresa_id: companies.length > 0 ? companies[0].id : '',
    });
    setShowModal(true);
  }

  async function handleViewHistory(user) {
    setSelectedUserForHistory(user);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setUserHistory([]);

    try {
      const response = await api.get(`/usuarios/${user.id}/history`);
      setUserHistory(response.data);
    } catch (error) {
      console.error('Error loading user history:', error);
      setFeedback('Erro ao carregar o histórico de contagens deste usuário.');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      if (currentUser) {
        const dataToSend = { ...formData };
        if (!dataToSend.senha) {
          delete dataToSend.senha;
        }

        await api.put(`/usuarios/${currentUser.id}`, dataToSend);
        setFeedback('Usuário atualizado com sucesso.');
      } else {
        await api.post('/usuarios', formData);
        setFeedback('Usuário criado com sucesso.');
      }

      setShowModal(false);
      await loadUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      setFeedback(`Erro ao salvar usuário: ${error.response?.data?.error || error.message}`);
    }
  }

  const filteredUsers = users.filter(
    (user) =>
      user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const adminCount = users.filter((user) => user.nivel_acesso === 'admin').length;
  const managerCount = users.filter((user) => user.nivel_acesso === 'gerente').length;
  const operatorCount = users.filter((user) => user.nivel_acesso === 'operador').length;

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
                    Gestão de acessos
                  </div>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Organize usuários, perfis e empresas com mais clareza.
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                    Centralize permissões do sistema e mantenha a equipe pronta para operar inventários com segurança.
                  </p>
                  <div className="mt-6">
                    <button
                      type="button"
                      onClick={handleAddNew}
                      className="inline-flex items-center rounded-2xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/30 transition-all hover:bg-indigo-400"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Novo usuário
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Total</p>
                    <p className="mt-3 text-3xl font-bold text-white">{users.length}</p>
                    <p className="mt-2 text-sm text-slate-300">Usuários cadastrados.</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Administradores</p>
                    <p className="mt-3 text-3xl font-bold text-white">{adminCount}</p>
                    <p className="mt-2 text-sm text-slate-300">Acesso completo ao sistema.</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Operadores</p>
                    <p className="mt-3 text-3xl font-bold text-white">{operatorCount}</p>
                    <p className="mt-2 text-sm text-slate-300">Equipe de execução.</p>
                  </div>
                </div>
              </div>
            </section>

            {feedback ? (
              <section className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-800">
                {feedback}
              </section>
            ) : null}

            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Gerentes</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{managerCount}</p>
                <p className="mt-2 text-sm text-slate-500">Usuários com supervisão operacional.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Empresas</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{companies.length}</p>
                <p className="mt-2 text-sm text-slate-500">Empresas disponíveis para vínculo.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Busca</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{filteredUsers.length}</p>
                <p className="mt-2 text-sm text-slate-500">Resultados conforme filtro atual.</p>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Pesquisa</p>
                  <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Encontre um usuário</h2>
                </div>

                <div className="relative w-full max-w-xl">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                    <Search className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar usuário por nome ou e-mail..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm">
              <table className="min-w-full">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Usuário
                    </th>
                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Perfil
                    </th>
                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Empresa
                    </th>
                    <th className="px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-sm text-slate-500">
                        Carregando usuários...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-sm text-slate-500">
                        Nenhum usuário encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="transition-colors hover:bg-slate-50/80">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-sm font-bold text-indigo-700 cursor-pointer hover:bg-indigo-100 transition-colors" onClick={() => handleViewHistory(user)} title="Ver histórico de contagens">
                              {user.nome.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleViewHistory(user)} title="Ver histórico de contagens">{user.nome}</div>
                              <div className="text-sm text-slate-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              ROLE_STYLES[user.nivel_acesso] || ROLE_STYLES.operador
                            }`}
                          >
                            {user.nivel_acesso.charAt(0).toUpperCase() + user.nivel_acesso.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{user.Empresa?.nome || 'N/A'}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleViewHistory(user)}
                              className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
                              title="Ver Histórico"
                            >
                              <History className="mr-2 h-4 w-4" />
                              Histórico
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEdit(user)}
                              className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(user.id)}
                              className="inline-flex items-center rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </div>
        </main>

        {showModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
              <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {currentUser ? 'Editar usuário' : 'Novo usuário'}
                  </p>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                    {currentUser ? 'Atualize os dados do acesso' : 'Cadastre um novo acesso'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Nome completo</label>
                    <input
                      type="text"
                      required
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      value={formData.nome}
                      onChange={(event) => setFormData({ ...formData, nome: event.target.value })}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">E-mail</label>
                    <input
                      type="email"
                      required
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      value={formData.email}
                      onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                    />
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">
                        {currentUser ? 'Senha (opcional)' : 'Senha'}
                      </label>
                      <input
                        type="password"
                        required={!currentUser}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                        value={formData.senha}
                        onChange={(event) => setFormData({ ...formData, senha: event.target.value })}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-700">Nível de acesso</label>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                        value={formData.nivel_acesso}
                        onChange={(event) => setFormData({ ...formData, nivel_acesso: event.target.value })}
                      >
                        <option value="operador">Operador</option>
                        <option value="gerente">Gerente</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Empresa</label>
                    <select
                      required
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                      value={formData.empresa_id}
                      onChange={(event) => setFormData({ ...formData, empresa_id: event.target.value })}
                    >
                      <option value="">Selecione uma empresa</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <Shield className="mt-0.5 h-5 w-5 text-indigo-600" />
                      <p className="text-sm text-slate-600">
                        Use perfis mais altos apenas para gestão. Operadores devem ter acesso restrito às rotinas de contagem.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse justify-end gap-3 border-t border-slate-100 pt-5 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      Salvar usuário
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : null}

        {/* History Modal */}
        {showHistoryModal && selectedUserForHistory && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
            <div className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
              <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Histórico do Usuário
                  </p>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                    {selectedUserForHistory.nome}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6 bg-slate-50/50">
                {historyLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <p className="text-slate-500">Carregando histórico de contagens...</p>
                  </div>
                ) : userHistory.length === 0 ? (
                  <div className="flex flex-col justify-center items-center py-16 text-center">
                    <Package className="h-12 w-12 text-slate-300 mb-4" />
                    <h4 className="text-lg font-medium text-slate-900">Nenhuma contagem encontrada</h4>
                    <p className="text-slate-500 mt-1 max-w-md">
                      Este usuário ainda não realizou nenhuma contagem de produtos no sistema.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead className="bg-slate-50/80 border-b border-slate-100">
                            <tr>
                              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                Data / Hora
                              </th>
                              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                Inventário
                              </th>
                              <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                Produto
                              </th>
                              <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                Qtd Contada
                              </th>
                              <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                Validade
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {userHistory.map((item) => (
                              <tr key={item.id} className="transition-colors hover:bg-slate-50/80">
                                <td className="px-5 py-3 text-sm text-slate-600 whitespace-nowrap">
                                  {new Date(item.data_hora).toLocaleString('pt-BR', {
                                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit'
                                  })}
                                </td>
                                <td className="px-5 py-3 text-sm font-medium text-slate-900">
                                  {item.Inventario?.nome || 'N/A'}
                                </td>
                                <td className="px-5 py-3">
                                  <div className="font-medium text-slate-900 text-sm">{item.Produto?.nome}</div>
                                  <div className="text-xs text-slate-500">SKU: {item.Produto?.sku} | EAN: {item.Produto?.codigo_barras}</div>
                                </td>
                                <td className="px-5 py-3 text-right text-sm font-bold text-indigo-700">
                                  {formatNumber(item.quantidade_contada)}
                                </td>
                                <td className="px-5 py-3 text-right text-sm text-slate-600">
                                  {item.validade ? new Date(item.validade).toLocaleDateString('pt-BR') : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {userHistory.length === 200 && (
                        <div className="bg-slate-50 p-3 text-center text-xs text-slate-500 border-t border-slate-100">
                          Exibindo as 200 contagens mais recentes.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
