
import React, { useState } from 'react';
import { InventoryItem } from '../types';
import { Plus, Edit, Trash2, Package, Search, AlertTriangle, Box, DollarSign, Filter, Minus, PlusCircle, X, Truck, Tag } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InventoryPageProps {
  items: InventoryItem[];
  onAddItem: (item: Omit<InventoryItem, 'id'>) => void;
  onUpdateItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({ items, onAddItem, onUpdateItem, onDeleteItem }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  
  const initialFormState: Omit<InventoryItem, 'id'> = {
    name: '',
    category: 'Uniforme',
    size: '',
    quantity: 0,
    minQuantity: 5,
    salePrice: 0,
    costPrice: 0,
    supplier: ''
  };

  const [form, setForm] = useState(initialFormState);

  const categories = Array.from(new Set(items.map(i => i.category)));

  const handleOpenNew = () => {
    setEditingId(null);
    setForm(initialFormState);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setForm({
        name: item.name,
        category: item.category,
        size: item.size || '',
        quantity: item.quantity,
        minQuantity: item.minQuantity,
        salePrice: item.salePrice || 0,
        costPrice: item.costPrice || 0,
        supplier: item.supplier || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
        onUpdateItem({ ...form, id: editingId });
    } else {
        onAddItem(form);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este item do estoque?')) {
        onDeleteItem(id);
    }
  };

  const handleQuickAdjust = (item: InventoryItem, amount: number) => {
      onUpdateItem({ ...item, quantity: Math.max(0, item.quantity + amount) });
  };

  const filteredItems = items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (item.supplier && item.supplier.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
  }).sort((a, b) => {
      // Sort by low stock first
      const aLow = a.quantity <= a.minQuantity;
      const bLow = b.quantity <= b.minQuantity;
      if (aLow && !bLow) return -1;
      if (!aLow && bLow) return 1;
      return a.name.localeCompare(b.name);
  });

  const totalValue = items.reduce((acc, item) => acc + (item.quantity * (item.salePrice || 0)), 0);
  const lowStockCount = items.filter(i => i.quantity <= i.minQuantity).length;

  const handleExportPDF = () => {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("Relatório de Estoque - Garotos do Martinica", 14, 20);
      doc.setFontSize(10);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28);
      doc.text(`Valor Total Estimado (Venda): R$ ${totalValue.toFixed(2)}`, 14, 34);

      const rows = filteredItems.map(item => [
          item.name,
          item.category,
          item.size || '-',
          item.supplier || '-',
          item.quantity.toString(),
          `R$ ${(item.costPrice || 0).toFixed(2)}`,
          `R$ ${(item.salePrice || 0).toFixed(2)}`,
          item.quantity <= item.minQuantity ? 'BAIXO' : 'OK'
      ]);

      autoTable(doc, {
          startY: 40,
          head: [['Item', 'Categoria', 'Tam.', 'Fornecedor', 'Qtd', 'Custo', 'Venda', 'Status']],
          body: rows,
          headStyles: { fillColor: [50, 50, 50] },
          styles: { fontSize: 8 },
          didParseCell: (data) => {
              if (data.section === 'body' && data.column.index === 7) {
                  if (data.cell.raw === 'BAIXO') data.cell.styles.textColor = [220, 38, 38];
                  else data.cell.styles.textColor = [22, 163, 74];
              }
          }
      });

      doc.save('Estoque.pdf');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-gray-800">Controle de Estoque</h2>
            <p className="text-gray-500 text-sm">Gerencie uniformes, equipamentos e materiais.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
             <button 
                onClick={handleExportPDF}
                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
             >
                <Package className="w-4 h-4" /> Relatório
             </button>
             <button 
                onClick={handleOpenNew}
                className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
             >
                <Plus className="w-4 h-4" /> Novo Item
             </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-sm text-gray-500">Total de Itens</p>
                  <h3 className="text-2xl font-bold text-gray-800">{items.length}</h3>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-blue-600"><Box className="w-6 h-6" /></div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-sm text-gray-500">Valor Estimado (Venda)</p>
                  <h3 className="text-2xl font-bold text-green-600">R$ {totalValue.toFixed(2)}</h3>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-green-600"><DollarSign className="w-6 h-6" /></div>
          </div>
          <div className={`bg-white p-5 rounded-xl border shadow-sm flex items-center justify-between ${lowStockCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-100'}`}>
              <div>
                  <p className={`text-sm ${lowStockCount > 0 ? 'text-red-600' : 'text-gray-500'}`}>Estoque Baixo</p>
                  <h3 className={`text-2xl font-bold ${lowStockCount > 0 ? 'text-red-700' : 'text-gray-800'}`}>{lowStockCount} itens</h3>
              </div>
              <div className={`p-3 rounded-lg ${lowStockCount > 0 ? 'bg-red-100 text-red-600' : 'bg-gray-50 text-gray-400'}`}><AlertTriangle className="w-6 h-6" /></div>
          </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
           <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="Buscar item ou fornecedor..." 
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
           </div>
           <div className="relative w-full sm:w-48">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <select 
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm appearance-none bg-white"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                >
                    <option value="ALL">Todas Categorias</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
           </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase font-semibold">
                    <tr>
                        <th className="px-6 py-4">Item</th>
                        <th className="px-6 py-4">Categoria</th>
                        <th className="px-6 py-4">Tamanho</th>
                        <th className="px-6 py-4">Fornecedor</th>
                        <th className="px-6 py-4 text-center">Quantidade</th>
                        <th className="px-6 py-4 text-right">Preço Venda</th>
                        <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {filteredItems.map(item => {
                        const isLow = item.quantity <= item.minQuantity;
                        return (
                            <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-gray-800">{item.name}</span>
                                        {isLow && (
                                            <span className="text-[10px] text-red-600 font-bold flex items-center gap-1 mt-1">
                                                <AlertTriangle className="w-3 h-3" /> Repor Estoque (Min: {item.minQuantity})
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-600">{item.category}</span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    {item.size || '-'}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600 max-w-[150px] truncate">
                                    {item.supplier || '-'}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-center gap-3">
                                        <button onClick={() => handleQuickAdjust(item, -1)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors"><Minus className="w-4 h-4" /></button>
                                        <span className={`font-bold w-8 text-center ${isLow ? 'text-red-600' : 'text-gray-800'}`}>{item.quantity}</span>
                                        <button onClick={() => handleQuickAdjust(item, 1)} className="text-gray-400 hover:text-green-500 hover:bg-green-50 p-1 rounded transition-colors"><PlusCircle className="w-4 h-4" /></button>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right font-medium text-gray-600">
                                    {item.salePrice ? `R$ ${item.salePrice.toFixed(2)}` : '-'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => handleOpenEdit(item)} className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDelete(item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    {filteredItems.length === 0 && (
                        <tr>
                            <td colSpan={7} className="p-8 text-center text-gray-400">Nenhum item encontrado.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Editar Item' : 'Novo Item no Estoque'}</h3>
                      <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Item</label>
                          <input required type="text" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                              placeholder="Ex: Camisa de Treino 2024"
                              value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                              <input list="categories" required type="text" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                  placeholder="Ex: Uniforme"
                                  value={form.category} onChange={e => setForm({...form, category: e.target.value})} />
                              <datalist id="categories">
                                  <option value="Uniforme" />
                                  <option value="Equipamento" />
                                  <option value="Material de Treino" />
                                  <option value="Outros" />
                              </datalist>
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Tamanho / Variação</label>
                              <input type="text" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                  placeholder="Ex: P, 38, Único"
                                  value={form.size} onChange={e => setForm({...form, size: e.target.value})} />
                          </div>
                      </div>

                      <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
                           <div className="relative">
                               <Truck className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                               <input type="text" className="w-full border rounded-lg p-2.5 pl-9 focus:ring-2 focus:ring-primary-500 outline-none" 
                                  placeholder="Nome do Fornecedor"
                                  value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} />
                           </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                           <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Quantidade Atual</label>
                              <input required type="number" min="0" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                  value={form.quantity} onChange={e => setForm({...form, quantity: parseInt(e.target.value) || 0})} />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Estoque Mínimo</label>
                              <input required type="number" min="0" className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none" 
                                  value={form.minQuantity} onChange={e => setForm({...form, minQuantity: parseInt(e.target.value) || 0})} />
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Preço de Custo (R$)</label>
                              <input type="number" min="0" step="0.01" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none bg-red-50 focus:bg-white" 
                                  value={form.costPrice} onChange={e => setForm({...form, costPrice: parseFloat(e.target.value) || 0})} />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Preço de Venda (R$)</label>
                              <input type="number" min="0" step="0.01" className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-primary-500 outline-none bg-green-50 focus:bg-white" 
                                  value={form.salePrice} onChange={e => setForm({...form, salePrice: parseFloat(e.target.value) || 0})} />
                          </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-2">
                          <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                          <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium">Salvar Item</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};
