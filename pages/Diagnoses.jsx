import React, { useState } from 'react';
import { useAdultOpd } from '../context/AdultOpdContext';

export default function Diagnoses() {
  const { diagnoses, addDiagnosis, updateDiagnosis } = useAdultOpd();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const visible = diagnoses.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));

  function handleAdd(event) {
    event.preventDefault();
    const result = addDiagnosis(name);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setName('');
    setMessage('Diagnosis added. This catalog is local to this health center and is not an official Ministry of Health list.');
  }

  return (
    <div className="aopd-page">
      <h2>Diagnoses</h2>
      <p className="aopd-lede">
        Configure the searchable diagnosis list used during patient entry. This is a local catalog for this facility. It
        is not presented as an official Ethiopian Ministry of Health diagnosis list.
      </p>

      <form className="aopd-inline-form" onSubmit={handleAdd}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add diagnosis"
        />
        <button type="submit" className="aopd-btn">
          Add
        </button>
      </form>
      {message && <p className="aopd-success">{message}</p>}

      <input
        className="aopd-search"
        type="search"
        placeholder="Search diagnoses"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="aopd-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Diagnosis</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td>
                  {editingId === item.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  ) : (
                    item.name
                  )}
                </td>
                <td>{item.active === false ? 'Disabled' : 'Active'}</td>
                <td className="aopd-row-actions">
                  {editingId === item.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (editName.trim()) updateDiagnosis(item.id, { name: editName.trim() });
                          setEditingId(null);
                        }}
                      >
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditName(item.name);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => updateDiagnosis(item.id, { active: item.active === false })}
                      >
                        {item.active === false ? 'Enable' : 'Disable'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
