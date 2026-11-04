import { requestUrl, type RequestUrlParam } from 'obsidian';
import type { IssueReport } from './issueReport';
import { ATLAS_GITHUB_URL } from './communityLinks';

export interface IssueReceipt {
  number: number;
  url: string;
}

/** The reporting service names issues under the repository's former owner too, which GitHub redirects. */
const RECEIPT_REPOSITORY_URLS = [ATLAS_GITHUB_URL, 'https://github.com/ByteMirror/atlas-vtt'];

type SendRequest = (request: RequestUrlParam) => Promise<{ status: number; json: unknown }>;

export function createIssueSubmitter(
  endpoint: string,
  send: SendRequest = requestUrl,
): (report: IssueReport, requestId: string) => Promise<IssueReceipt> {
  return async (report, requestId): Promise<IssueReceipt> => {
    if (!endpoint.startsWith('https://')) throw new Error('Issue reporting is not configured in this build.');
    let response: Awaited<ReturnType<SendRequest>>;
    try {
      response = await send({
        url: endpoint,
        method: 'POST',
        contentType: 'application/json',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, report }),
        throw: false,
      });
    } catch {
      throw new Error('Could not reach the reporting service. Check your connection.');
    }
    let data: Partial<IssueReceipt> & { error?: unknown } | null;
    try {
      data = response.json as typeof data;
    } catch {
      throw new Error('The reporting service could not confirm submission.');
    }
    if (response.status !== 201) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'The reporting service could not confirm submission.');
    }
    const number = data?.number;
    const url = data?.url;
    if (number === undefined || !Number.isSafeInteger(number) || number < 1 || url === undefined
      || !RECEIPT_REPOSITORY_URLS.some(repository => url === `${repository}/issues/${number}`)) {
      throw new Error('The reporting service returned an invalid confirmation.');
    }
    return { number, url };
  };
}
