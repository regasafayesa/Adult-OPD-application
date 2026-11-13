import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/common/ReportTables';
import { ADULT_AGE_GROUPS, MONTH_NAMES, OPD_CATEGORY, SEX } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';
import {
  daysInEthiopianMonth,
  ETHIOPIAN_MONTH_NAMES,
  formatEthiopianDate,
  getEthiopianEncounterDateBounds,
  matchesEthiopianEncounterDate,
} from '../utils/ethiopianCalendar';
import { searchFacilityEncounters } from '../services/supabaseData';
import { MONTHLY_DIAGNOSIS_AGE_GROUPS } from '../services/monthlyDiagnosisCounts.mjs';
import PatientEntry from './PatientEntry';

function emptyRecordFilters() {
  return {
    query: '',
    date: { year: '', month: '', day: '' },
    sex: '',
    ageGroup: '',
    diagnosis: '',
    opdCategory: '',
    status: '',
  };
}

function EthiopianDateFilter({ label, value, onChange }) {
  const year = Number(value.year);
  const daysInMonth = daysInEthiopianMonth(year, value.month);

  function updatePart(part, nextValue) {
    const updated = { ...value, [part]: nextValue };
    if (part !== 'day' && updated.day
        && Number(updated.day) > daysInEthiopianMonth(Number(updated.year), updated.month)) {
      updated.day = '';
    }
    onChange(updated);
  }

  return (
    <div className="aopd-records-ethiopian-date">
      <span>{label}</span>
      <div className="aopd-records-ethiopian-date-fields">
        <input
          type="number"
          min="1"
          max="9999"
          step="1"
          placeholder="Year"
          aria-label={`${label} year (Ethiopian)`}
          value={value.year}
          onChange={(event) => updatePart('year', event.target.value)}
        />
        <select
          aria-label={`${label} month (Ethiopian)`}
          value={value.month}
          onChange={(event) => updatePart('month', event.target.value)}
        >
          <option value="">Month</option>
          {ETHIOPIAN_MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>{name}</option>
          ))}
        </select>
        <select
          aria-label={`${label} day (Ethiopian)`}
          value={value.day}
          onChange={(event) => updatePart('day', event.target.value)}
        >
          <option value="">Day</option>
          {Array.from({ length: daysInMonth }, (_, index) => (
            <option key={index + 1} value={index + 1}>{index + 1}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function PatientRecords() {
  const navigate = useNavigate();
  const {
    records,
    diagnoses,
    monthlyDiagnosisCounts,
    monthlyDiagnosisCountsStatus,
    monthlyDiagnosisCountsError,
    deleteRecord,
    clearMonthlyDiagnosisCounts,
    facilityId,
    canManageFacility,
    canWriteEncounters,
    canWriteMonthlyDiagnosisCounts,
  } = useAdultOpd();
  const now = new Date();
  const [activeRecordsTab, setActiveRecordsTab] = useState('encounters');
  const [aggregateMonth, setAggregateMonth] = useState(now.getMonth() + 1);
  const [aggregateYear, setAggregateYear] = useState(now.getFullYear());
  const [clearingAggregates, setClearingAggregates] = useState(false);
  const [aggregateMessage, setAggregateMessage] = useState('');
  const [aggregateMessageIsError, setAggregateMessageIsError] = useState(false);
  const [filters, setFilters] = useState(emptyRecordFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
      if (!matchesEthiopianEncounterDate(record.date, filters)) return false;
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
    const dateBounds = getEthiopianEncounterDateBounds(filters);
    searchFacilityEncounters(facilityId, {
      ...filters,
      date: '',
      month: '',
      year: '',
      encounterDateFrom: dateBounds.from,
      encounterDateBefore: dateBounds.before,
    })
      .then((results) => {
        if (active) {
          setCloudFiltered(results.filter((record) =>
            matchesEthiopianEncounterDate(record.date, filters)
          ));
        }
      })
      .catch((error) => {
        if (!active) return;
        setCloudFiltered([]);
        setSearchError(error.message || 'Could not search facility records in the cloud.');
      })
      .finally(() => {
        if (active) setSearchLoading(false);
      });
    return () => {
      active = false;
    };
  }, [facilityId, filters, records]);

  const filtered = useMemo(() => {
    const source = facilityId ? cloudFiltered : localFiltered;
    return [...source].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [cloudFiltered, facilityId, localFiltered]);
  const activeFilterCount = [
    filters.query,
    filters.year,
    filters.month,
    filters.sex,
    filters.ageGroup,
    filters.diagnosis,
    filters.opdCategory,
    filters.status,
    filters.date.year && filters.date.month && filters.date.day,
  ].filter(Boolean).length;
  const savedAggregateRows = useMemo(() => monthlyDiagnosisCounts
    .filter((item) =>
      Number(item.reportingYear) === Number(aggregateYear)
      && Number(item.reportingMonth) === Number(aggregateMonth)
    )
    .flatMap((item) => MONTHLY_DIAGNOSIS_AGE_GROUPS.flatMap((group) => [
      { ...item, ...group, sex: SEX.FEMALE, field: group.femaleField },
      { ...item, ...group, sex: SEX.MALE, field: group.maleField },
    ]).filter(({ field }) => Number(item[field]) > 0)), [
    aggregateMonth,
    aggregateYear,
    monthlyDiagnosisCounts,
  ]);
  const savedAggregateSummaryCount = monthlyDiagnosisCounts.filter((item) =>
    Number(item.reportingYear) === Number(aggregateYear)
    && Number(item.reportingMonth) === Number(aggregateMonth)
  ).length;

  function updateFilter(field, value) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  function clearFilters() {
    setFilters(emptyRecordFilters());
  }

  async function handleDelete(id) {
    setActionMessage('');
    const result = await deleteRecord(id);
    setActionMessageIsError(!result.ok);
    setActionMessage(result.ok
      ? result.refreshError
        ? 'Encounter deleted from the cloud, but the latest facility records could not be reloaded.'
        : 'Encounter deleted from the facility database.'
      : result.error);
  }

  async function handleClearAggregateSummaries() {
    const periodLabel = `${MONTH_NAMES[aggregateMonth - 1]} ${aggregateYear}`;
    if (!window.confirm(
      `Permanently delete all saved registration-book summaries for ${periodLabel}? Individual patient encounters will not be changed.`
    )) return;
    setClearingAggregates(true);
    setAggregateMessage('');
    const result = await clearMonthlyDiagnosisCounts(aggregateYear, aggregateMonth);
    setClearingAggregates(false);
    setAggregateMessageIsError(!result.ok);
    setAggregateMessage(result.ok
      ? `Saved aggregate summaries for ${periodLabel} were cleared. Individual encounters were not changed.`
      : result.error);
  }

  function editAggregateCount(item, ageGroupKey, sex) {
    navigate('/adult-opd/aggregate-entry', {
      state: { aggregateEdit: { item, ageGroupKey, sex } },
    });
  }

  if (editing) {
    return <PatientEntry editingRecord={editing} onDone={() => setEditing(null)} />;
  }

  return (
    <div className="aopd-page aopd-records-page">
      <header className="aopd-records-intro">
        <div>
          <h2>Patient records</h2>
          <p className="aopd-lede">
            Encounters are stored without names or identifiers and classified into four age groups.
            Filter records below; all saved encounters remain available.
          </p>
        </div>
      </header>

      <nav className="aopd-records-tabs" role="tablist" aria-label="Record type">
        <button
          type="button"
          role="tab"
          className={activeRecordsTab === 'encounters' ? 'is-active' : ''}
          id="aopd-records-encounters-tab"
          aria-controls="aopd-records-encounters-panel"
          aria-selected={activeRecordsTab === 'encounters'}
          onClick={() => setActiveRecordsTab('encounters')}
        >
          Patient encounters
        </button>
        <button
          type="button"
          role="tab"
          className={activeRecordsTab === 'aggregates' ? 'is-active' : ''}
          id="aopd-records-aggregates-tab"
          aria-controls="aopd-records-aggregates-panel"
          aria-selected={activeRecordsTab === 'aggregates'}
          onClick={() => setActiveRecordsTab('aggregates')}
        >
          Saved aggregate summaries
        </button>
      </nav>

      <section
        className="aopd-records-encounters"
        id="aopd-records-encounters-panel"
        role="tabpanel"
        aria-labelledby="aopd-records-encounters-tab"
        hidden={activeRecordsTab !== 'encounters'}
      >
      <div className="aopd-records-filter-toolbar">
        <button
          type="button"
          className="aopd-records-filter-toggle"
          aria-expanded={filtersOpen}
          aria-controls="aopd-records-filter-panel"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <span className="aopd-records-filter-icon" aria-hidden="true">☷</span>
          <span>Filters</span>
          {activeFilterCount > 0 && <span className="aopd-records-filter-count">{activeFilterCount}</span>}
          <span className={`aopd-records-filter-chevron${filtersOpen ? ' is-open' : ''}`} aria-hidden="true">⌄</span>
        </button>
        {activeFilterCount > 0 && (
          <span className="aopd-records-filter-summary">
            {activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}
          </span>
        )}
      </div>

      <div
        className="aopd-filter-grid aopd-records-filters"
        id="aopd-records-filter-panel"
        hidden={!filtersOpen}
      >
        <input
          type="search"
          className="aopd-records-search"
          placeholder="Search diagnosis, age, sex..."
          value={filters.query}
          onChange={(e) => updateFilter('query', e.target.value)}
        />
        <select className="aopd-records-sex-filter" value={filters.sex} onChange={(e) => updateFilter('sex', e.target.value)}>
          <option value="">All sexes</option>
          <option value={SEX.MALE}>Male</option>
          <option value={SEX.FEMALE}>Female</option>
        </select>
        <select className="aopd-records-age-filter" value={filters.ageGroup} onChange={(e) => updateFilter('ageGroup', e.target.value)}>
          <option value="">All age groups</option>
          {ADULT_AGE_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
        <select className="aopd-records-diagnosis-filter" value={filters.diagnosis} onChange={(e) => updateFilter('diagnosis', e.target.value)}>
          <option value="">All diagnoses</option>
          {diagnoses.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <EthiopianDateFilter
          label="Encounter date"
          value={filters.date}
          onChange={(value) => updateFilter('date', value)}
        />
        <select className="aopd-records-category-filter" value={filters.opdCategory} onChange={(e) => updateFilter('opdCategory', e.target.value)}>
          <option value="">All OPD categories</option>
          <option value={OPD_CATEGORY.ADULT}>OPD</option>
          <option value={OPD_CATEGORY.OUTSIDE}>Outside OPD Categories</option>
        </select>
        <select className="aopd-records-status-filter" value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
          <option value="">All reporting status</option>
          <option value="adult">Included in OPD report</option>
          <option value="outside">Outside reporting age groups</option>
        </select>
        {activeFilterCount > 0 && (
          <button type="button" className="aopd-records-clear-filters" onClick={clearFilters}>
            Clear all filters
          </button>
        )}
      </div>

      {searchLoading && <p role="status">Searching facility records in the cloud…</p>}
      {searchError && <p className="aopd-error" role="alert">{searchError}</p>}
      {actionMessage && <p className={actionMessageIsError ? 'aopd-error' : 'aopd-success'} role={actionMessageIsError ? 'alert' : 'status'}>{actionMessage}</p>}

      <div className="aopd-table-wrap aopd-records-table-wrap">
        <table className="aopd-records-table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Age</th>
              <th>Age Group</th>
              <th>OPD Category</th>
              <th>Sex</th>
              <th>Diagnosis</th>
              <th>Status</th>
              {(canWriteEncounters || canManageFacility) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canWriteEncounters || canManageFacility ? 8 : 7} className="aopd-empty">
                  No records match the current filters.
                </td>
              </tr>
            )}
            {filtered.map((record) => (
              <tr key={record.id}>
                <td>{formatEthiopianDate(record.date)}</td>
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
                {(canWriteEncounters || canManageFacility) && <td className="aopd-row-actions">
                  <button type="button" onClick={() => setViewing(record)}>
                    View
                  </button>
                  {canWriteEncounters && <button type="button" onClick={() => setEditing(record)}>
                    Edit
                  </button>}
                  {canManageFacility && <button
                    type="button"
                    className="danger-text"
                    onClick={() => {
                      if (window.confirm('Delete this encounter? Reports will update immediately.')) {
                        handleDelete(record.id);
                      }
                    }}
                  >
                    Delete
                  </button>}
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>

      <section
        className="aopd-records-aggregate"
        id="aopd-records-aggregates-panel"
        role="tabpanel"
        aria-labelledby="aopd-records-aggregates-tab aopd-records-aggregate-heading"
        hidden={activeRecordsTab !== 'aggregates'}
      >
        <header className="aopd-records-aggregate-header">
          <div>
            <h3 id="aopd-records-aggregate-heading">Saved aggregate summaries</h3>
            <p>Registration-book counts saved separately from individual patient encounters.</p>
          </div>
          <div className="aopd-records-aggregate-period">
            <label>
              Month
              <select value={aggregateMonth} onChange={(event) => setAggregateMonth(Number(event.target.value))}>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              Year
              <input
                type="number"
                min="1"
                max="9999"
                step="1"
                value={aggregateYear}
                onChange={(event) => setAggregateYear(event.target.value)}
              />
            </label>
          </div>
        </header>

        {monthlyDiagnosisCountsStatus === 'loading' && (
          <p role="status">Loading saved aggregate summaries…</p>
        )}
        {monthlyDiagnosisCountsStatus === 'error' && (
          <p className="aopd-error" role="alert">
            {monthlyDiagnosisCountsError} Review and apply
            {' '}<code>supabase/migrations/20261024_monthly_diagnosis_counts.sql</code>
            {' '}in Supabase SQL Editor to enable saved aggregate summaries.
          </p>
        )}
        {aggregateMessage && (
          <p className={aggregateMessageIsError ? 'aopd-error' : 'aopd-success'} role={aggregateMessageIsError ? 'alert' : 'status'}>
            {aggregateMessage}
          </p>
        )}

        <div className="aopd-records-aggregate-toolbar">
          <p>
            {savedAggregateSummaryCount} {savedAggregateSummaryCount === 1 ? 'diagnosis summary' : 'diagnosis summaries'} · {savedAggregateRows.length} age/sex counts
          </p>
          {canManageFacility && (
            <button
              type="button"
              className="aopd-records-aggregate-clear"
              onClick={handleClearAggregateSummaries}
              disabled={clearingAggregates || savedAggregateSummaryCount === 0 || monthlyDiagnosisCountsStatus === 'loading'}
            >
              {clearingAggregates ? 'Clearing…' : `Clear summaries for ${MONTH_NAMES[aggregateMonth - 1]} ${aggregateYear}`}
            </button>
          )}
        </div>

        <div className="aopd-table-wrap aopd-records-aggregate-table-wrap">
          <table className="aopd-records-aggregate-table">
            <thead>
              <tr>
                <th>Diagnosis</th>
                <th>Age group</th>
                <th>Sex</th>
                <th className="num">Cases</th>
                {canWriteMonthlyDiagnosisCounts && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {savedAggregateRows.map((item) => (
                <tr key={`${item.id}:${item.key}:${item.sex}`}>
                  <td>{item.diagnosisCode ? `${item.diagnosisCode} — ` : ''}{item.diagnosisName}</td>
                  <td>{item.label}</td>
                  <td>{item.sex}</td>
                  <td className="num">{item[item.field]}</td>
                  {canWriteMonthlyDiagnosisCounts && (
                    <td className="aopd-row-actions">
                      <button
                        type="button"
                        onClick={() => editAggregateCount(item, item.key, item.sex)}
                      >
                        Edit count
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!savedAggregateRows.length && monthlyDiagnosisCountsStatus !== 'loading' && (
                <tr>
                  <td colSpan={canWriteMonthlyDiagnosisCounts ? 5 : 4} className="aopd-empty">
                    No saved aggregate summaries for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {viewing && (
        <div className="aopd-modal" onClick={() => setViewing(null)}>
          <div className="aopd-modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Encounter detail</h3>
            <dl className="aopd-view">
              <div>
                <dt>Date</dt>
                <dd>{formatEthiopianDate(viewing.date)}</dd>
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
