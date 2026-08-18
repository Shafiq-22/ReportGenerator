/*
 * `Image` here is @react-pdf/renderer's PDF primitive, not an HTML <img>,
 * so the DOM alt-text rule does not apply.
 */
/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import {
  activeSections,
  aggregateEquipment,
  aggregateManpower,
  aggregateMaterials,
  issuesForSection,
  selectPhotos,
  type ReportModel,
} from './section-model'
import type { SectionConfig } from '@/lib/validation/schemas'

/** Decoded image bytes keyed by attachment id. */
export type ImageAsset = { data: Buffer; format: 'jpg' | 'png' }
export type ImageAssets = Map<string, ImageAsset>

const ACCENT = '#1d4ed8'
const BORDER = '#d8dee9'
const MUTED = '#64748b'

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#0f172a',
    lineHeight: 1.5,
  },
  coverPage: {
    padding: 56,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#0f172a',
    justifyContent: 'center',
  },
  coverRule: { height: 3, width: 96, backgroundColor: ACCENT, marginBottom: 24 },
  coverTitle: { fontSize: 28, fontFamily: 'Helvetica-Bold', marginBottom: 10 },
  coverProject: { fontSize: 15, color: ACCENT, marginBottom: 28 },
  coverMetaRow: { flexDirection: 'row', marginBottom: 5 },
  coverMetaLabel: { width: 110, color: MUTED },
  coverMetaValue: { flex: 1 },

  header: {
    position: 'absolute',
    top: 20,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: MUTED,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 5,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: MUTED,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 5,
  },

  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
  },
  dayHeading: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 5,
    color: ACCENT,
  },
  paragraph: { marginBottom: 6 },
  muted: { color: MUTED },
  small: { fontSize: 9 },

  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 2, marginBottom: 10 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },
  trLast: { flexDirection: 'row' },
  th: {
    padding: 5,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#f1f5f9',
  },
  td: { padding: 5, fontSize: 9 },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  stat: {
    width: '25%',
    paddingVertical: 6,
    paddingRight: 8,
  },
  statValue: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  statLabel: { fontSize: 8, color: MUTED, textTransform: 'uppercase' },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  photoCell: { paddingHorizontal: 4, marginBottom: 10 },
  photo: { width: '100%', height: 150, objectFit: 'cover', borderWidth: 1, borderColor: BORDER },
  caption: { fontSize: 8, color: MUTED, marginTop: 3 },

  bullet: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
})

function formatDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return value
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function Table({
  head,
  rows,
  widths,
}: {
  head: string[]
  rows: Array<Array<string | number>>
  widths: string[]
}) {
  if (rows.length === 0) return null
  return (
    <View style={styles.table}>
      <View style={styles.tr}>
        {head.map((cell, i) => (
          <Text key={i} style={[styles.th, { width: widths[i] }]}>
            {cell}
          </Text>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={rowIndex === rows.length - 1 ? styles.trLast : styles.tr}>
          {row.map((cell, i) => (
            <Text key={i} style={[styles.td, { width: widths[i] }]}>
              {String(cell ?? '')}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function PageChrome({ model }: { model: ReportModel }) {
  return (
    <>
      <View style={styles.header} fixed>
        <Text>{model.project.name}</Text>
        <Text>{model.title}</Text>
      </View>
      <View style={styles.footer} fixed>
        <Text>
          {model.companyName} · {formatDate(model.dateFrom)} – {formatDate(model.dateTo)}
        </Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  )
}

function CoverPage({ model, logo }: { model: ReportModel; logo?: ImageAsset }) {
  return (
    <Page size="A4" style={styles.coverPage}>
      {logo ? (
        <Image src={{ data: logo.data, format: logo.format }} style={{ width: 120, marginBottom: 32 }} />
      ) : null}
      <View style={styles.coverRule} />
      <Text style={styles.coverTitle}>{model.title}</Text>
      <Text style={styles.coverProject}>{model.project.name}</Text>

      <Meta label="Company" value={model.companyName} />
      {model.project.code ? <Meta label="Job number" value={model.project.code} /> : null}
      {model.project.client_name ? <Meta label="Client" value={model.project.client_name} /> : null}
      {model.project.location ? <Meta label="Location" value={model.project.location} /> : null}
      <Meta label="Period" value={`${formatDate(model.dateFrom)} – ${formatDate(model.dateTo)}`} />
      <Meta label="Daily reports" value={String(model.totals.dayCount)} />
      <Meta
        label="Generated"
        value={new Date(model.generatedAt).toLocaleString('en-GB', { timeZone: 'UTC' })}
      />
      {model.generatedBy ? <Meta label="Prepared by" value={model.generatedBy} /> : null}
    </Page>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.coverMetaRow}>
      <Text style={styles.coverMetaLabel}>{label}</Text>
      <Text style={styles.coverMetaValue}>{value}</Text>
    </View>
  )
}

function SummarySection({ model, title }: { model: ReportModel; title: string }) {
  const t = model.totals
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>

      <View style={styles.statRow}>
        <Stat value={t.dayCount} label="Daily reports" />
        <Stat value={t.activityCount} label="Activities" />
        <Stat value={t.issueCount} label="Issues" />
        <Stat value={t.openIssueCount} label="Open issues" />
        <Stat value={t.totalManHours} label="Man hours" />
        <Stat value={t.totalDelayDays} label="Delay days" />
        <Stat value={t.photoCount} label="Photos" />
        <Stat value={t.documentCount} label="Documents" />
      </View>

      {model.days
        .filter((day) => day.summary)
        .map((day) => (
          <View key={day.id} wrap={false}>
            <Text style={styles.dayHeading}>{formatDate(day.report_date)}</Text>
            <Text style={styles.paragraph}>{day.summary}</Text>
          </View>
        ))}
    </View>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function ActivitiesSection({ model, title }: { model: ReportModel; title: string }) {
  const days = model.days.filter((day) => day.activities.length > 0)
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {days.length === 0 ? (
        <Text style={styles.muted}>No activities recorded in this period.</Text>
      ) : (
        days.map((day) => (
          <View key={day.id} wrap={false}>
            <Text style={styles.dayHeading}>
              {formatDate(day.report_date)}
              {day.author_name ? ` · ${day.author_name}` : ''}
            </Text>
            {day.activities.map((activity) => (
              <View key={activity.id} style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <View style={styles.bulletText}>
                  <Text>
                    {activity.title}
                    {activity.category ? ` (${activity.category})` : ''}
                    {activity.percent_complete !== null
                      ? ` — ${activity.percent_complete}% complete`
                      : ''}
                  </Text>
                  {activity.description ? (
                    <Text style={[styles.small, styles.muted]}>{activity.description}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  )
}

function IssuesSection({
  model,
  title,
  config,
}: {
  model: ReportModel
  title: string
  config: SectionConfig
}) {
  const issues = issuesForSection(model, config)
  const dateById = new Map(model.days.flatMap((d) => d.issues.map((i) => [i.id, d.report_date])))

  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {issues.length === 0 ? (
        <Text style={styles.muted}>No issues recorded in this period.</Text>
      ) : (
        <Table
          head={['Date', 'Issue', 'Severity', 'Status', 'Delay (d)']}
          widths={['14%', '46%', '14%', '14%', '12%']}
          rows={issues.map((issue) => [
            formatDate(dateById.get(issue.id) ?? ''),
            issue.description ? `${issue.title} — ${issue.description}` : issue.title,
            issue.severity,
            issue.status,
            issue.delay_days ?? '',
          ])}
        />
      )}
    </View>
  )
}

function ManpowerSection({ model, title }: { model: ReportModel; title: string }) {
  const totals = aggregateManpower(model.days)
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Table
        head={['Trade', 'Peak headcount', 'Man hours', 'Days on site']}
        widths={['46%', '18%', '18%', '18%']}
        rows={totals.map((row) => [row.trade, row.headcount, Math.round(row.hours), row.days])}
      />
      {totals.length === 0 ? <Text style={styles.muted}>No manpower recorded.</Text> : null}
    </View>
  )
}

function EquipmentSection({ model, title }: { model: ReportModel; title: string }) {
  const totals = aggregateEquipment(model.days)
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Table
        head={['Equipment', 'Peak qty', 'Hours used', 'Days on site']}
        widths={['46%', '18%', '18%', '18%']}
        rows={totals.map((row) => [row.name, row.quantity, Math.round(row.hours), row.days])}
      />
      {totals.length === 0 ? <Text style={styles.muted}>No equipment recorded.</Text> : null}
    </View>
  )
}

function MaterialsSection({ model, title }: { model: ReportModel; title: string }) {
  const totals = aggregateMaterials(model.days)
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Table
        head={['Material', 'Quantity', 'Unit', 'Deliveries']}
        widths={['46%', '18%', '18%', '18%']}
        rows={totals.map((row) => [row.name, row.quantity, row.unit ?? '', row.deliveries])}
      />
      {totals.length === 0 ? <Text style={styles.muted}>No materials recorded.</Text> : null}
    </View>
  )
}

function PhotosSection({
  model,
  title,
  config,
  images,
}: {
  model: ReportModel
  title: string
  config: SectionConfig
  images: ImageAssets
}) {
  const photos = selectPhotos(model, config).filter((photo) => images.has(photo.id))
  const columns = Math.min(Math.max(config.columns ?? 2, 1), 4)
  const width = `${100 / columns}%`
  const showCaptions = config.showCaptions !== false

  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      {photos.length === 0 ? (
        <Text style={styles.muted}>No photos available for this period.</Text>
      ) : (
        <View style={styles.photoGrid}>
          {photos.map((photo) => {
            const asset = images.get(photo.id)!
            return (
              <View key={photo.id} style={[styles.photoCell, { width }]} wrap={false}>
                <Image src={{ data: asset.data, format: asset.format }} style={styles.photo} />
                {showCaptions ? (
                  <Text style={styles.caption}>
                    {photo.report_date ? `${formatDate(photo.report_date)} · ` : ''}
                    {photo.caption || photo.file_name}
                  </Text>
                ) : null}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

function DocumentsSection({ model, title }: { model: ReportModel; title: string }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Table
        head={['Date', 'Document', 'Type']}
        widths={['18%', '58%', '24%']}
        rows={model.documents.map((doc) => [
          doc.report_date ? formatDate(doc.report_date) : '',
          doc.file_name,
          doc.mime_type.split('/').pop() ?? doc.mime_type,
        ])}
      />
      {model.documents.length === 0 ? (
        <Text style={styles.muted}>No supporting documents attached.</Text>
      ) : (
        <Text style={[styles.small, styles.muted]}>
          Native PDF attachments are appended in full after this index.
        </Text>
      )}
    </View>
  )
}

/**
 * The report document.
 *
 * Every section reads from the same `ReportModel` the preview uses, so the PDF
 * and the on-screen builder cannot drift apart.
 */
export function ReportDocument({
  model,
  images,
  logo,
}: {
  model: ReportModel
  images: ImageAssets
  logo?: ImageAsset
}) {
  const sections = activeSections(model.sections)
  const cover = sections.find((section) => section.section_type === 'cover')
  const body = sections.filter((section) => section.section_type !== 'cover')

  return (
    <Document title={model.title} author={model.companyName} subject={model.project.name}>
      {cover ? <CoverPage model={model} logo={logo} /> : null}

      {body.length > 0 ? (
        <Page size="A4" style={styles.page}>
          <PageChrome model={model} />
          {body.map((section, index) => (
            <View key={`${section.section_type}-${section.sort_order}`} break={index > 0}>
              {section.section_type === 'summary' ? (
                <SummarySection model={model} title={section.title} />
              ) : section.section_type === 'activities' ? (
                <ActivitiesSection model={model} title={section.title} />
              ) : section.section_type === 'issues' ? (
                <IssuesSection model={model} title={section.title} config={section.config} />
              ) : section.section_type === 'manpower' ? (
                <ManpowerSection model={model} title={section.title} />
              ) : section.section_type === 'equipment' ? (
                <EquipmentSection model={model} title={section.title} />
              ) : section.section_type === 'materials' ? (
                <MaterialsSection model={model} title={section.title} />
              ) : section.section_type === 'photos' ? (
                <PhotosSection
                  model={model}
                  title={section.title}
                  config={section.config}
                  images={images}
                />
              ) : section.section_type === 'documents' ? (
                <DocumentsSection model={model} title={section.title} />
              ) : (
                <View>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text>{section.config.body ?? ''}</Text>
                </View>
              )}
            </View>
          ))}
        </Page>
      ) : null}
    </Document>
  )
}
