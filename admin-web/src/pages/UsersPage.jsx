
import { useEffect, useState } from 'react';
import api from '../services/api';
import { Trash2, UserPlus, Shield } from 'lucide-react';
import { format } from 'date-fns';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      if (res.data.success) {
        setUsers(res.data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/users', { email, name });
      if (res.data.success) {
        setShowModal(false);
        setEmail('');
        setName('');
        fetchUsers();
        alert('Admin added successfully');
      }
    } catch (error) {
      alert('Failed to add admin');
    }
  };

  const handleDelete = async (userEmail) => {
    if (!confirm(`Remove admin access for ${userEmail}?`)) return;
    try {
        await api.delete(`/admin/users/${userEmail}`);
        fetchUsers();
    } catch (e) { alert('Error removing admin'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Admin Users</h2>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <UserPlus size={18} />
            <span>Add Admin</span>
        </button>
      </div>

      <div className="glass-card">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-sm">
                    <th className="p-4">Name</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Added At</th>
                    <th className="p-4 text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="text-sm">
                {loading ? (
                    <tr><td colSpan="4" className="p-8 text-center text-slate-500">Loading...</td></tr>
                ) : (
                    users.map(user => (
                        <tr key={user.email} className="border-b border-slate-800 hover:bg-slate-800/50">
                            <td className="p-4 font-medium text-white flex items-center gap-2">
                                <div className="p-1.5 bg-blue-500/10 rounded-full text-blue-500"><Shield size={14} /></div>
                                {user.name}
                            </td>
                            <td className="p-4 text-slate-300">{user.email}</td>
                            <td className="p-4 text-slate-500">{user.created_at ? format(new Date(user.created_at), 'dd/MM/yyyy') : 'N/A'}</td>
                            <td className="p-4 text-right">
                                <button onClick={() => handleDelete(user.email)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                    <Trash2 size={18} />
                                </button>
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="glass-card w-full max-w-sm animate-fade-in">
                <h3 className="text-xl font-bold text-white mb-4">Add New Admin</h3>
                <form onSubmit={handleAdd} className="space-y-4">
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Email (Google Account)</label>
                        <input type="email" className="input-field" required value={email} onChange={e => setEmail(e.target.value)} placeholder="example@gmail.com" />
                    </div>
                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Name</label>
                        <input type="text" className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="Admin Name" />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={() => setShowModal(false)} className="btn hover:bg-slate-700 text-slate-300">Cancel</button>
                        <button type="submit" className="btn btn-primary">Add Access</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}
