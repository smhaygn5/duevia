export type SubmissionVersionSource = {
  id: string;
  milestone_position: number;
  submitted_at: number;
  note: string | null;
};

export type SubmissionVersion = SubmissionVersionSource & {
  version: number;
  isLatest: boolean;
};

export function getSubmissionVersions(
  submissions: SubmissionVersionSource[],
  milestonePosition: number,
): SubmissionVersion[] {
  const chronological = submissions
    .filter((submission) => submission.milestone_position === milestonePosition)
    .sort(
      (left, right) =>
        left.submitted_at - right.submitted_at || left.id.localeCompare(right.id),
    );

  return chronological
    .map((submission, index) => ({
      ...submission,
      version: index + 1,
      isLatest: index === chronological.length - 1,
    }))
    .reverse();
}
