import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MONTHLY_DIAGNOSIS_AGE_GROUPS,
} from '../../services/monthlyDiagnosisCounts.mjs';

const HELP_TOPICS = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    category: 'Getting started',
    summary: 'A monthly snapshot of facility OPD activity.',
    keywords: 'overview month year total male female age groups diagnoses trend demo',
    path: '/adult-opd',
    sections: [
      {
        title: 'Choose a period and read the overview',
        steps: [
          'Use Year and Month at the top to select the reporting period. The dashboard initially uses the current month and the facility reporting year when available.',
          'Review Total, Male, Female, and age-group cards. The dashboard totals combine eligible individual encounters with registration-book counts saved for the selected month.',
          'Use the charts to compare cases by age group, sex, diagnosis, and month. The diagnosis chart shows up to eight diagnoses.',
        ],
        note: 'If registration-book counts cannot load, an alert explains that dashboard totals include individual encounters only. Resolve the cloud data issue before treating those totals as complete.',
      },
      {
        title: 'Demo data',
        paragraphs: [
          'Authorized staff can load labelled demo encounters or clear demo encounters. Demo records are clearly marked and should not be treated as real facility data.',
          'Clearing demo encounters does not clear registration-book summaries. Those are managed separately in Aggregate Entry.',
        ],
      },
    ],
  },
  {
    id: 'patient-entry',
    title: 'Patient Entry',
    category: 'Entering data',
    summary: 'Record one eligible OPD encounter at a time without personal identifiers.',
    keywords: 'new encounter date age years sex diagnosis autocomplete save pending queue cloud batch',
    path: '/adult-opd/entry',
    sections: [
      {
        title: 'Enter an encounter',
        steps: [
          'Open Patient Entry and enter the date of the visit.',
          'Enter age as a whole number of years, select Male or Female, and select a diagnosis from the suggested diagnosis list.',
          'Review Automatic classification. It shows the calculated age group, OPD category, and whether the encounter is included in the OPD report.',
          'For a new encounter, choose Add to pending queue. Check the pending list, correct any flagged items, then choose Save All to the cloud.',
          'Wait for the confirmation. If the save is uncertain or incomplete, keep the pending entries and follow the on-screen message before retrying.',
        ],
        note: 'Do not enter patient names or other identifiers. Patient Entry requires an age of at least 5 years. Use the registration-book aggregate workflow for the under-five report age bands.',
      },
      {
        title: 'Correct an existing encounter',
        steps: [
          'Open Patient Records and choose Edit on the encounter.',
          'Correct the date, age, sex, or diagnosis and save the changes.',
          'Confirm the success message. The report is recalculated from the corrected encounter.',
        ],
        paragraphs: [
          'The queue is for new encounters. Editing an existing encounter saves that record directly rather than adding a second copy to the queue.',
        ],
      },
    ],
  },
  {
    id: 'patient-records',
    title: 'Patient Records',
    category: 'Entering data',
    summary: 'Find, review, edit, or—when authorized—delete individual encounters.',
    keywords: 'filter search date month year sex age diagnosis opd category status view edit delete',
    path: '/adult-opd/records',
    sections: [
      {
        title: 'Find records',
        steps: [
          'Open Filters and use any combination of text, date, month, year, sex, age group, diagnosis, OPD category, and reporting-status filters.',
          'Choose Clear all filters to return to the full facility list.',
          'Choose View to inspect an encounter’s date, age, classification, sex, diagnosis, reporting period, and inclusion status.',
        ],
        note: 'In a signed-in facility workspace, the records list is searched in the cloud. A search or connection error is shown above the table; an empty result alone does not prove that the facility has no records.',
      },
      {
        title: 'Edit and delete',
        paragraphs: [
          'Staff who can write encounters can edit records. Facility owners and admins can delete them after confirming the action. Deleting an encounter changes report totals; it does not delete registration-book summaries.',
          'Records contain encounter details, not patient names or personal identifiers. The DEMO label identifies demo encounters.',
        ],
      },
    ],
  },
  {
    id: 'diagnoses',
    title: 'Diagnosis Management',
    category: 'Managing the facility',
    summary: 'Search the diagnosis catalog used by encounter entry and aggregate reporting.',
    keywords: 'diagnosis catalog search add edit disable enable official facility code active',
    path: '/adult-opd/diagnoses',
    sections: [
      {
        title: 'Search and maintain diagnoses',
        steps: [
          'Search by diagnosis name or code to find a catalog entry.',
          'Owners and admins can add a facility diagnosis, edit facility-created diagnosis names, and enable or disable facility diagnoses.',
          'Use active diagnoses when entering encounters or registration-book counts. A disabled diagnosis is not selectable for new counts.',
        ],
        note: 'The catalog includes approved entries and facility diagnoses. Facility-created entries are not represented as an official Ministry of Health diagnosis list. Do not disable or rename a diagnosis without checking the effect on local reporting practice.',
      },
    ],
  },
  {
    id: 'monthly-report',
    title: 'Monthly OPD Report',
    category: 'Reports',
    summary: 'Detailed guide to the monthly ICT tally sheet, its counts, and its checks.',
    keywords: 'tutorial ICT tally sheet reporting month year female male age group age categories under one 12 59 months 5 14 15 29 30 64 65 tally marks numerical diagnosis total grand total aggregate encounter registration book combine double count double counting duplicate missing incomplete inconsistent export excel pdf print',
    path: '/adult-opd/monthly',
    featured: true,
    sections: [
      {
        title: '1. Select the reporting month and year',
        steps: [
          'Open Monthly Report. The initial year is the facility reporting year when set (otherwise the current year); the initial month is the current month.',
          'Select the reporting Year and Month in the toolbar. The displayed ICT sheet and its calculated totals update for that period.',
          'Before exporting, verify the month and year printed in the report heading against the facility register.',
        ],
      },
      {
        title: '2. Understand the age columns',
        paragraphs: [
          'The sheet has six age columns under each sex. Age bands are mutually exclusive: each case belongs in one band only.',
        ],
        table: {
          headers: ['Report column', 'Age range / reporting source'],
          rows: MONTHLY_DIAGNOSIS_AGE_GROUPS.map(({ key, label }) => [
            label,
            key === 'below1'
              ? 'Younger than 12 months; supplied by registration-book aggregates'
              : key === 'months12To59'
                ? '12 to younger than 60 months; supplied by registration-book aggregates'
                : `${label}; classified from individual encounters or entered as an aggregate`,
          ]),
        },
        note: 'Patient Entry records age in whole years and requires age 5 or older; the individual OPD report includes ages 5 and above (5–14, 15–29, 30–64, and 65+). Any pre-existing or imported record under age 5 is outside the individual OPD categories and is excluded from this report. Use Aggregate Entry to supply the Below 1 year and 12–59 months columns from the registration book.',
      },
      {
        title: '3. How individual encounters contribute',
        paragraphs: [
          'A saved encounter contributes one case to its reporting month (based on its visit date), diagnosis, sex, and automatically classified age group when the age is 5 or older. Multiple visits are counted as multiple encounters; this is a visit count, not a unique-person count.',
          'Patient Entry does not accept ages below 5. If a pre-existing or imported record under 5 appears in Patient Records, it is outside the individual OPD reporting age groups and does not contribute to the monthly OPD tally sheet.',
        ],
      },
      {
        title: '4. How registration-book aggregates contribute',
        steps: [
          'Open Aggregate Entry (Registration-book counts), select the reporting month and year, and choose an active diagnosis.',
          'Choose one age band and sex, enter the number of cases from the month’s registration-book summary, then add it to the pending queue.',
          'Repeat for each diagnosis, age band, and sex with cases. Review the pending counts and select Save All. Confirm the saved summaries appear for the selected period.',
          'If you enter an optional Registration-book total, compare it with the sum of all age/sex counts for that diagnosis. A difference must be reviewed and explicitly confirmed before saving; the optional total is a check value, not an extra report count.',
        ],
        note: 'Aggregate counts are monthly numbers, not named or individually identifiable encounters. They are the route for reporting the two under-five age bands, and can also represent cases maintained as a registration-book summary.',
      },
      {
        title: '5. How the report combines sources—avoid double-counting',
        paragraphs: [
          'For each diagnosis, sex, and age band, the report adds eligible saved individual encounter counts to the saved registration-book bucket for the same diagnosis, sex, age band, month, and year. It does not match people or visits between sources.',
          'Decide locally which source is authoritative for each case. If the same visit is entered as an individual encounter and also included in an aggregate count, both values are added and the result is double-counted. The software cannot detect or remove that overlap. Never copy an already-entered encounter into a book aggregate for the same reporting total.',
          'For under-five bands, individual encounters are excluded, so those report columns are supplied by aggregates. For ages 5+, use either the encounter source or the aggregate source for a case—not both.',
        ],
        table: {
          headers: ['Example, one diagnosis and month', 'Cases'],
          rows: [
            ['Eligible saved encounters (age 5+)', '8'],
            ['Registration-book count for other cases (same diagnosis)', '3'],
            ['Combined report total, if the groups do not overlap', '11'],
            ['If those 3 were already among the 8 encounters', '11 (incorrect; the 3 are counted twice)'],
          ],
        },
      },
      {
        title: '6. Female, Male, tally marks, and numerical counts',
        paragraphs: [
          'The sheet groups columns first by Male and Female, then by age band. Each saved encounter or aggregate count is assigned to its selected sex; Female and Male values are not inferred from other fields.',
          'The Tally cell is a visual rendering of the numerical count. Each stroke represents one case; groups of five are drawn as four strokes crossed by a fifth. The adjacent Count cell shows the actual integer. A blank count cell represents zero/no cases for that diagnosis and bucket.',
          'For a bucket with 12 cases, for example, the Count is 12 and the Tally shows two groups of five plus two strokes. The tally is not a separate value to enter or add.',
        ],
      },
      {
        title: '7. Diagnosis totals and the grand total',
        paragraphs: [
          'A computed diagnosis subtotal is the sum of that diagnosis’s Male and Female counts across the six age bands. The Monthly ICT sheet displays each age/sex bucket as a tally and a number; it does not add a separate diagnosis-subtotal column.',
          'When diagnosis codes or catalog IDs identify the same diagnosis in both sources, their counts are shown on the same row. Similar display names with different diagnosis identities remain separate.',
          'The monthly grand total is the sum of all diagnosis bucket counts for the selected month, after combining the two sources. The Monthly ICT sheet does not print a separate grand-total row; the Dashboard and Yearly Report show combined totals derived from the same reporting values.',
          'Diagnosis rows are sorted by combined case count (largest first), then by diagnosis name. Where a diagnosis has a recognized code, the report displays the code and name. The asterisk marks rows that include registration-book aggregate counts.',
        ],
      },
      {
        title: '8. Check for missing, incomplete, or inconsistent data',
        steps: [
          'Confirm the selected reporting month and year and the facility name/location in Settings.',
          'Compare saved encounters for that period in Patient Records with source registers. Review date, diagnosis, sex, age, and the inclusion status; correct entry errors at the source record.',
          'In Aggregate Entry, confirm that required diagnosis, sex, and age-band counts were queued and saved. Review optional book-total discrepancies, notes, save errors, and the saved summary list.',
          'Review any Calculation warning above the report. It indicates that a consistency check found that individual encounter age-group, diagnosis, sex, or overall subtotals do not reconcile.',
          'If the report says aggregate counts could not load, treat the displayed result as incomplete: the page explicitly indicates when only individual encounters are available.',
          'Investigate missing diagnosis rows, unexpected zeros, abrupt changes, and duplicate cases by comparing the underlying records and registration book. A report cannot identify cases that were never entered or automatically detect overlap between its two sources.',
        ],
        note: 'A warning is a prompt to investigate, not an automatic correction. Resolve the source data or cloud issue, then review the report again.',
      },
      {
        title: '9. Export and print the monthly sheet',
        steps: [
          'Choose Excel to download a spreadsheet, PDF to download a PDF, or Print to open the browser print dialog.',
          'Check the report period and facility heading before sharing or filing the output. Use the print dialog’s destination and page settings to print or save to PDF.',
          'If export fails, read the error displayed above the report and retry after resolving the reported issue. Keep the report on screen for review in the meantime.',
        ],
      },
    ],
  },
  {
    id: 'aggregate-counts',
    title: 'Aggregate Registration Counts',
    category: 'Entering data',
    summary: 'Enter monthly registration-book totals by diagnosis, age band, and sex.',
    keywords: 'aggregate registration book monthly counts diagnosis age sex cases pending queue save edit discrepancy total notes delete clear',
    path: '/adult-opd/aggregate-entry',
    sections: [
      {
        title: 'Enter and save counts',
        steps: [
          'Set the reporting year and month, select an active diagnosis, choose an age group and sex, and enter a non-negative whole-number case count.',
          'Add the count to the pending queue. Repeat for each required diagnosis/age/sex bucket; repeated pending entries for the same bucket replace the pending value.',
          'Review Pending counts and use Save All. Confirm that summaries appear in Saved summaries for the reporting period.',
          'Use Edit count to correct a saved bucket. Owners and admins can clear all saved summaries for a selected month after confirming; this does not change individual encounters.',
        ],
        note: 'The optional registration-book total is compared with the sum of entered buckets for the diagnosis. If they differ, review the source and confirm the discrepancy. Notes/source reference are optional. The comparison total itself is not added to report calculations.',
      },
      {
        title: 'How this differs from Patient Entry',
        paragraphs: [
          'Patient Entry stores one record per visit with a date, age in years, sex, and diagnosis. Aggregate Entry stores a monthly count for a diagnosis, age band, and sex, without one record per person.',
          'Use one source per case in the monthly report. Combined reports add the eligible encounters and saved aggregate buckets; they do not reconcile or de-duplicate the same case entered in both.',
        ],
      },
    ],
  },
  {
    id: 'yearly-report',
    title: 'Yearly Report',
    category: 'Reports',
    summary: 'Review combined monthly, age-group, and diagnosis totals for a selected year.',
    keywords: 'year annual months totals age diagnosis trends excel print combined',
    path: '/adult-opd/yearly',
    sections: [
      {
        title: 'Review a year',
        steps: [
          'Set the Year. The page shows combined totals for each month, a year total, combined counts by the six age bands, and yearly diagnosis statistics.',
          'Use Show combined diagnosis trends by month to show or hide the monthly diagnosis table.',
          'Check for calculation warnings or a notice that registration-book summaries could not load before relying on the totals.',
          'Choose Excel to export or Print to open the browser print dialog.',
        ],
        note: 'Yearly totals sum the monthly combined results. The same source separation and no-double-counting guidance as the Monthly OPD Report applies.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    category: 'Managing the facility',
    summary: 'Maintain facility details used in report headings and configure the reporting year.',
    keywords: 'facility details health center region zone woreda reporting year responsible person position save settings',
    path: '/adult-opd/settings',
    sections: [
      {
        title: 'Facility details',
        steps: [
          'Owners and admins can enter the health center name, region, zone, woreda, reporting year, responsible person name, and position.',
          'Choose Save facility settings and wait for the saved confirmation. Facility details appear in report headings and sign-off where applicable.',
        ],
        note: 'Other roles see facility settings as read-only. The reporting year provides the default year in reporting screens; it does not prevent selecting another year.',
      },
      {
        title: 'Other Settings actions',
        paragraphs: [
          'In cloud mode, owners and admins can review and explicitly import legacy encounters and diagnoses from the current browser. Review the confirmation first: the operation sends selected legacy patient data to the cloud, keeps the original browser data, and reports duplicates, conflicts, and failures.',
          'Demo data and clear-all-encounter actions are separate from registration-book summaries. Clearing encounters does not clear the aggregate summaries for any month.',
        ],
      },
    ],
  },
  {
    id: 'facility-management',
    title: 'Facility Management',
    category: 'Managing the facility',
    summary: 'Manage facility membership or switch between facilities where authorized.',
    keywords: 'facility members invitations invite remove revoke multiple active facility switch platform approvals',
    sections: [
      {
        title: 'Facility members and invitations',
        steps: [
          'Owners and admins can open Facility members to review current members and pending invitations.',
          'Enter a staff email, choose an available role, and create an invitation. The staff member must sign in or create a verified account with that invited email and accept the invitation.',
          'Revoke an invitation that should no longer be used. Owners/admins can remove eligible members; removing someone from this facility does not remove access they have to another facility.',
        ],
        note: 'Owners can invite admins, data-entry staff, or viewers. Admins can invite data-entry staff or viewers. The owner membership is protected from removal in this screen.',
      },
      {
        title: 'Multiple facilities and platform approvals',
        paragraphs: [
          'If your account belongs to more than one facility, choose the active facility in the application header. Reports and records then belong to that selected facility.',
          'Platform approvals are a separate route shown only to platform administrators. Facility registration and approvals are not ordinary facility-member controls.',
        ],
      },
    ],
  },
  {
    id: 'roles',
    title: 'User Roles and Access',
    category: 'Managing the facility',
    summary: 'Understand the facility roles and the controls they expose.',
    keywords: 'owner admin data_entry viewer permission access read only invite manage diagnose edit delete reports',
    sections: [
      {
        title: 'Facility roles',
        table: {
          headers: ['Role', 'What the application allows'],
          rows: [
            ['Owner', 'Manage facility settings and facility members; write encounters and registration-book counts; manage diagnoses.'],
            ['Admin', 'Manage facility settings and facility members; write encounters and registration-book counts; manage diagnoses.'],
            ['Data entry', 'Create and edit encounters and write registration-book counts; reporting and other visible pages remain available.'],
            ['Viewer', 'Read-only reporting and record access; data-entry routes are not available.'],
          ],
        },
        note: 'Available actions are role-checked by the application and facility data access is enforced by the cloud service. Some destructive or administrative actions are reserved for owners/admins.',
      },
      {
        title: 'Account access',
        paragraphs: [
          'Sign in with the account invited to your facility. If you have access to several facilities, select the correct active facility before entering or reviewing data.',
          'If a page or action is missing, it may be restricted for your role. Contact your facility owner or admin rather than sharing an account.',
        ],
      },
    ],
  },
  {
    id: 'sync',
    title: 'Data Synchronization and Cloud Saving',
    category: 'Managing the facility',
    summary: 'Know when data is saved, how shared facility data loads, and what errors mean.',
    keywords: 'cloud sync save saving pending error offline refresh shared authorized devices supabase legacy import',
    sections: [
      {
        title: 'Cloud data and save confirmations',
        steps: [
          'After sign-in, the application verifies facility access and loads shared facility data. Wait for the workspace to finish loading before using reports.',
          'New encounters and aggregate counts are queued until you choose Save All. Wait for the confirmed saved count and resolve any remaining pending items or errors.',
          'Facility settings have their own save action and status. Look for the cloud-saved confirmation.',
          'If a cloud sync or report-loading error appears, read it and resolve the connection, access, or configuration issue. A screen that says summaries could not load does not contain complete combined totals.',
        ],
        note: 'Do not assume a queued item is saved. If the application says a save is unconfirmed or some items remain pending, keep the page open and follow the retry/reconciliation message before starting another copy.',
      },
      {
        title: 'Data sharing and privacy',
        paragraphs: [
          'Signed-in encounters, diagnoses, settings, and registration-book counts are stored for the selected facility in its cloud project and shared with authorized facility members.',
          'The encounter form does not collect patient names or other personal identifiers. Follow your organization’s privacy, access, and backup requirements when using the system.',
        ],
      },
    ],
  },
  {
    id: 'exports',
    title: 'Exporting and Printing Reports',
    category: 'Reports',
    summary: 'Create a spreadsheet, PDF, or printed copy of a report.',
    keywords: 'export download excel xlsx pdf print browser save output monthly yearly',
    sections: [
      {
        title: 'Monthly and yearly outputs',
        steps: [
          'Set and verify the reporting period and facility details before exporting.',
          'Monthly Report offers Excel, PDF, and Print. Yearly Report offers Excel and Print.',
          'For Print, use the browser print dialog to select a printer or save as PDF, then check page orientation, scaling, and page breaks.',
          'Open the exported file or print preview and confirm the facility name, period, totals, and legibility before filing or sharing.',
        ],
        note: 'Export errors appear on the report page. Resolve the displayed error and retry; do not treat an unsuccessful download as a completed report.',
      },
    ],
  },
];

function normalizeSearchText(value) {
  return String(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function searchableText(topic) {
  return normalizeSearchText([
    topic.title,
    topic.category,
    topic.summary,
    topic.keywords,
    ...topic.sections.flatMap((section) => [
      section.title,
      ...(section.paragraphs || []),
      ...(section.steps || []),
      ...(section.bullets || []),
      section.note || '',
      ...(section.table?.rows.flat() || []),
    ]),
  ].join(' '));
}

function TopicSection({ section, index, topicId }) {
  return (
    <details className="aopd-help-section" open={index === 0}>
      <summary>{section.title}</summary>
      <div className="aopd-help-section-content">
        {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {section.steps && (
          <ol>
            {section.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        )}
        {section.bullets && (
          <ul>
            {section.bullets.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}
        {section.table && (
          <div className="aopd-help-table-wrap">
            <table className="aopd-help-table">
              <thead>
                <tr>{section.table.headers.map((header) => <th key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {section.table.rows.map((row) => (
                  <tr key={row.join('|')}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${cellIndex}-${cell}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {section.note && <aside className="aopd-help-callout">{section.note}</aside>}
        {topicId === 'monthly-report' && section.title.startsWith('6.') && (
          <div className="aopd-help-tally-example" aria-label="Example tally of twelve cases">
            <span>Example tally for 12 cases</span>
            <code>||||/ &nbsp; ||||/ &nbsp; ||</code>
          </div>
        )}
      </div>
    </details>
  );
}

export default function HelpCenter() {
  const [query, setQuery] = useState('');
  const [activeTopicId, setActiveTopicId] = useState('dashboard');
  const searchTerms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  const topics = useMemo(() => HELP_TOPICS.filter((topic) =>
    searchTerms.length === 0 || searchTerms.every((term) => searchableText(topic).includes(term))
  ), [searchTerms.join(' ')]);
  const activeTopic = topics.find((topic) => topic.id === activeTopicId) || topics[0];
  const categories = useMemo(() => [...new Set(topics.map((topic) => topic.category))], [topics]);
  const activeIndex = activeTopic ? topics.findIndex((topic) => topic.id === activeTopic.id) : -1;

  function selectTopic(id) {
    setActiveTopicId(id);
    document.querySelector('.aopd-help-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main className="aopd-page aopd-help-page">
      <header className="aopd-help-hero">
        <div>
          <p className="aopd-help-eyebrow">OPD MONTHLY REPORTING SYSTEM</p>
          <h2>Help Center</h2>
          <p>Practical instructions for entering data, managing your facility, and preparing reliable reports.</p>
        </div>
        <Link className="aopd-help-back" to="/adult-opd">← Back to application</Link>
      </header>

      <div className="aopd-help-layout">
        <aside className="aopd-help-nav" aria-label="Help topics">
          <label className="aopd-help-search">
            <span>Search help</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveTopicId('');
              }}
              placeholder="Search instructions…"
              aria-label="Search help topics"
            />
          </label>
          {searchTerms.length > 0 && (
            <p className="aopd-help-result-count" role="status">
              {topics.length} {topics.length === 1 ? 'topic' : 'topics'} found
            </p>
          )}
          {topics.length === 0 ? (
            <p className="aopd-help-no-results">No matching topics. Try another word.</p>
          ) : categories.map((category) => (
            <section className="aopd-help-nav-group" key={category}>
              <h3>{category}</h3>
              {topics.filter((topic) => topic.category === category).map((topic) => (
                <button
                  type="button"
                  key={topic.id}
                  className={`aopd-help-topic-link${activeTopic?.id === topic.id ? ' is-active' : ''}${topic.featured ? ' is-featured' : ''}`}
                  onClick={() => selectTopic(topic.id)}
                  aria-current={activeTopic?.id === topic.id ? 'page' : undefined}
                >
                  {topic.featured && <span aria-hidden="true">★ </span>}
                  {topic.title}
                </button>
              ))}
            </section>
          ))}
        </aside>

        <article className="aopd-help-content" aria-live="polite">
          {activeTopic ? (
            <>
              <div className="aopd-help-topic-heading">
                <span>{activeTopic.category}{activeTopic.featured ? ' · Detailed tutorial' : ''}</span>
                <h3>{activeTopic.title}</h3>
                <p>{activeTopic.summary}</p>
                {activeTopic.path && (
                  <Link className="aopd-help-open-feature" to={activeTopic.path}>
                    Open {activeTopic.title} →
                  </Link>
                )}
              </div>
              <div className="aopd-help-sections">
                {activeTopic.sections.map((section, index) => (
                  <TopicSection
                    key={section.title}
                    section={section}
                    index={index}
                    topicId={activeTopic.id}
                  />
                ))}
              </div>
              <nav className="aopd-help-topic-pager" aria-label="Help topic navigation">
                <button
                  type="button"
                  onClick={() => selectTopic(topics[activeIndex - 1].id)}
                  disabled={activeIndex <= 0}
                >
                  ← Previous topic
                </button>
                <span>{activeIndex + 1} of {topics.length}</span>
                <button
                  type="button"
                  onClick={() => selectTopic(topics[activeIndex + 1].id)}
                  disabled={activeIndex < 0 || activeIndex >= topics.length - 1}
                >
                  Next topic →
                </button>
              </nav>
            </>
          ) : (
            <div className="aopd-help-empty">
              <span aria-hidden="true">?</span>
              <h3>Choose a help topic</h3>
              <p>Select a topic from the list to read its instructions.</p>
            </div>
          )}
        </article>
      </div>
      <footer className="aopd-help-footer">
        <span aria-hidden="true">+</span>
        For facility-specific reporting procedures, confirm local guidance with your supervisor.
      </footer>
    </main>
  );
}
