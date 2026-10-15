import React, { useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '../components/common/ReportTables';
import { ADULT_AGE_GROUPS, MONTH_NAMES, OPD_CATEGORY, SEX } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';
import { formatDisplayDate } from '../utils/dates';
import { searchFacilityEncounters } from '../services/supabaseData';
import PatientEntry from './PatientEntry';

export default function PatientRecords() {
  const { records, diagnoses, deleteRecord, facilityId } = useAdultOpd();
  const [filters, setFilters] = useState({
    query: '',
    date: '',
    month: '',
    year: '',
    sex: '',
    ageGroup: '',
    diagnosis: '',
    opdCategory: '',
    status: '',
  });
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [cloudFiltered, setCloudFiltered] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionMessageIsError, setActionMessageIsError] = useState(false);

  const localFiltered = useMemo(() => {
    return records.filter((record) => {
      if (filters.query) {
        const hay = `${record.diagnosis} ${record.age} ${record.sex} ${record.ageGroup} ${record.opdCategory}`.toLowerCase();
        if (!hay.includes(filters.query.toLowerCase())) return false;
      }
      if (filters.date && record.date !== filters.date) return false;
      if (filters.month && record.reportingMonth !== Number(filters.month)) return false;
      if (filters.year && record.reportingYear !== Number(filters.year)) return false;
      if (filters.sex && record.sex !== filters.sex) return false;
      if (filters.ageGroup && record.ageGroup !== filters.ageGroup) return false;
      if (filters.diagnosis && record.diagnosis !== filters.diagnosis) return false;
      if (filters.opdCategory && record.opdCategory !== filters.opdCategory) return false;
      if (filters.status === 'adult' && !record.includedInAdultReport) return false;
      if (filters.status === 'outside' && record.includedInAdultReport) return false;
      return true;
    });
  }, [records, filters]);

  useEffect(() => {
    if (!facilityId) return undefined;
    let active = true;
    setSearchLoading(true);
    setSearchError('');
    searchFacilityEncounters(facilityId, filters)
      .then((results) => {
        if (active) setCloudFiltered(results);
      })
      .catch((error) => {
        if (!active) return;
        setCloudFiltered([]);
        setSearchError(error.message || 'Could not search facility records in Supabase.');
      })
      .finally(() => {
        if (active) setSearchLoading(false);
      });
    return () => {
      active = false;
    };
  }, [facilityId, filters, records]);

  const filtered = facilityId ? cloudFiltered : localFiltered;

  function updateFilter(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  async function handleDelete(id) {
    setActionMessage('');
    const result = await deleteRecord(id);
    setActionMessageIsError(!result.ok);
    setActionMessage(result.ok
      ? result.refreshError
        ? 'Encounter deleted from Supabase, but the latest facility records could not be reloaded.'
        : 'Encounter deleted from the facility database.'
      : result.error);
  }

  if (editing) {
    return <PatientEntry editingRecord={editing} onDone={() => setEditing(null)} />;
  }

  return (
    <div className="aopd-page">
      <h2>Patient records</h2>
      <p className="aopd-lede">
        Encounters are stored without names or identifiers and classified into four age groups.
      </p>

      <div className="aopd-filter-grid">
        <input
          type="search"
          placeholder="Search diagnosis, age, sex..."
          value={filters.query}
          onChange={(e) => updateFilter('query', e.target.value)}
        />
        <input type="date" value={filters.date} onChange={(e) => updateFilter('date', e.target.value)} />
        <select value={filters.month} onChange={(e) => updateFilter('month', e.target.value)}>
          <option value="">All months</option>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Year"
          value={filters.year}
          onChange={(e) => updateFilter('year', e.target.value)}
        />
        <select value={filters.sex} onChange={(e) => updateFilter('sex', e.target.value)}>
          <option value="">All sexes</option>
          <option value={SEX.MALE}>Male</option>
          <option value={SEX.FEMALE}>Female</option>
        </select>
        <select value={filters.ageGroup} onChange={(e) => updateFilter('ageGroup', e.target.value)}>
          <option value="">All age groups</option>
          {ADULT_AGE_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
        <select value={filters.diagnosis} onChange={(e) => updateFilter('diagnosis', e.target.value)}>
          <option value="">All diagnoses</option>
          {diagnoses.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <select value={filters.opdCategory} onChange={(e) => updateFilter('opdCategory', e.target.value)}>
          <option value="">All OPD categories</option>
          <option value={OPD_CATEGORY.ADULT}>Adult OPD</option>
          <option value={OPD_CATEGORY.OUTSIDE}>Outside Adult OPD Categories</option>
        </select>
        <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
          <option value="">All reporting status</option>
          <option value="adult">Included in Adult report</option>
          <option value="outside">Outside reporting age groups</option>
        </select>
      </div>

      {searchLoading && <p role="status">Searching facility records in Supabase…</p>}
      {searchError && <p className="aopd-error" role="alert">{searchError}</p>}
      {actionMessage && <p className={actionMessageIsError ? 'aopd-error' : 'aopd-success'} role={actionMessageIsError ? 'alert' : 'status'}>{actionMessage}</p>}

      <div className="aopd-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Age</th>
              <th>Age Group</th>
              <th>OPD Category</th>
              <th>Sex</th>
              <th>Diagnosis</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="aopd-empty">
                  No records match the current filters.
                </td>
              </tr>
            )}
            {filtered.map((record) => (
              <tr key={record.id}>
                <td>{formatDisplayDate(record.date)}</td>
                <td className="num">{record.age}</td>
                <td>{record.ageGroup || '—'}</td>
                <td>{record.opdCategory}</td>
                <td>{record.sex}</td>
                <td>
                  {record.diagnosis}
                  {record.isDemo && <span className="aopd-demo-tag">DEMO</span>}
                </td>
                <td>
                  <StatusBadge record={record} />
                </td>
                <td className="aopd-row-actions">
                  <button type="button" onClick={() => setViewing(record)}>
                    View
                  </button>
                  <button type="button" onClick={() => setEditing(record)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger-text"
                    onClick={() => {
                      if (window.confirm('Delete this encounter? Reports will update immediately.')) {
                        handleDelete(record.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <div className="aopd-modal" onClick={() => setViewing(null)}>
          <div className="aopd-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Encounter detail</h3>
            <dl className="aopd-view">
              <div>
                <dt>Date</dt>
                <dd>{formatDisplayDate(viewing.date)}</dd>
              </div>
              <div>
                <dt>Age</dt>
                <dd>{viewing.age}</dd>
              </div>
              <div>
                <dt>Age group</dt>
                <dd>{viewing.ageGroup || '—'}</dd>
              </div>
              <div>
                <dt>OPD category</dt>
                <dd>{viewing.opdCategory}</dd>
              </div>
              <div>
                <dt>Sex</dt>
                <dd>{viewing.sex}</dd>
              </div>
              <div>
                <dt>Diagnosis</dt>
                <dd>{viewing.diagnosis}</dd>
              </div>
              <div>
                <dt>Adult report</dt>
                <dd>{viewing.includedInAdultReport ? 'Included' : 'Excluded'}</dd>
              </div>
              <div>
                <dt>Reporting period</dt>
                <dd>
                  {MONTH_NAMES[viewing.reportingMonth - 1]} {viewing.reportingYear}
                </dd>
              </div>
            </dl>
            <button type="button" className="aopd-btn" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
