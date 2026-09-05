export type ActivityExportRecord = {
  date: string;
  agreement: string;
  title: string;
  detail: string;
  proof: string | null;
};

function escapeCsv(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

export function activityCsv(records: ActivityExportRecord[]) {
  const header = ["Date", "Agreement", "Event", "Detail", "Arc transaction proof"];
  const rows = records.map((record) => [
    record.date,
    record.agreement,
    record.title,
    record.detail,
    record.proof ?? "",
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}
