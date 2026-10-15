import React, { useState } from 'react';
import { useAdultOpd } from '../context/AdultOpdContext';

export default function Diagnoses() {
  const { diagnoses, addDiagnosis, updateDiagnosis } = useAdultOpd();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);
  const [messageIsError, setMessageIsError] = useState(false);

  const visible = diagnoses.filter((item) =>
    `${item.name} ${item.code || ''}`.toLowerCase().includes(query.toLowerCase())
  );

  async function handleAdd(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await addDiagnosis(name);
      if (!result.ok) {
        setMessage(result.error);
        setMessageIsError(true);
        return;
      }
      setName('');
      setMessage('Diagnosis added to this facility catalog and synced to authorized devices. This is not an official Ministry of Health list.');
      setMessageIsError(false);
    } catch (error) {
      setMessage(error.message || 'Could not save diagnosis.');
      setMessageIsError(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(id, patch, successMessage) {
    setBusy(true);
    setMessage('');
    try {
      const result = await updateDiagnosis(id, patch);
      if (!result.ok) {
        setMessage(result.error);
        setMessageIsError(true);
        return false;
      }
      setMessage(successMessage);
      setMessageIsError(false);
      return true;
    } catch (error) {
      setMessage(error.message || 'Could not update diagnosis.');
      setMessageIsError(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="aopd-page">
      <h2>Diagnoses</h2>
      <p className="aopd-lede">
        Search and manage the diagnosis catalog shared by this facility. The catalog is not
        presented as an official Ethiopian Ministry of Health diagnosis list.
      </p>

      <form className="aopd-inline-form" onSubmit={handleAdd}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add diagnosis"
            disabled={busy}
          />
          <button type="submit" className="aopd-btn" disabled={busy}>
            {busy ? 'Saving…' : 'Add'}
          </button>
      </form>
      {message && <p className={messageIsError ? 'aopd-error' : 'aopd-success'} role={messageIsError ? 'alert' : 'status'}>{message}</p>}

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
              <th>Code</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.official ? item.name : editingId === item.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={busy} />
                  ) : (
                    item.name
                  )}
                </td>
                <td>{item.code || '—'}</td>
                <td>{item.active === false ? 'Disabled' : 'Active'}</td>
                <td className="aopd-row-actions">
                  {item.official ? 'Approved catalog' : editingId === item.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (editName.trim() && await handleUpdate(item.id, { name: editName.trim() }, 'Diagnosis updated in this facility catalog.')) {
                            setEditingId(null);
                          }
                        }}
                      >
                        Save
                      </button>
                      <button type="button" disabled={busy} onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(item.id);
                          setEditName(item.name);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleUpdate(
                          item.id,
                          { active: item.active === false },
                          item.active === false ? 'Diagnosis enabled.' : 'Diagnosis disabled.'
                        )}
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
