import { ATLAS_DISCORD_URL, ATLAS_GITHUB_URL } from '../support/communityLinks';
import type { IssueReporter } from '../support/IssueReporter';
import type { AtlasSettingSection } from './settingSections';
import { t } from '../i18n';

export function supportSettingsSection(reporter: IssueReporter): AtlasSettingSection {
  return {
    heading: t('settings.support.heading'),
    rows: [
      {
        name: t('settings.support.reportIssue'),
        desc: t('settings.support.reportIssueDesc'),
        aliases: ['bug', 'crash', 'problem', 'feedback', 'github', 'support'],
        render: setting => {
          setting.addButton(button => button.setButtonText(t('settings.support.reportIssue')).onClick(() => reporter.open({ type: 'bug' })));
        },
      },
      {
        name: t('settings.support.suggestFeature'),
        desc: t('settings.support.suggestFeatureDesc'),
        aliases: ['idea', 'request', 'enhancement'],
        render: setting => {
          setting.addButton(button => button.setButtonText(t('settings.support.suggestFeature')).onClick(() => reporter.open({ type: 'feature' })));
        },
      },
      {
        name: t('settings.support.discord'),
        desc: t('settings.support.discordDesc'),
        aliases: ['discord', 'community', 'chat', 'help'],
        render: setting => {
          setting.addButton(button => button.setButtonText(t('settings.support.joinDiscord')).onClick(() => { window.open(ATLAS_DISCORD_URL); }));
        },
      },
      {
        name: 'GitHub',
        desc: t('settings.support.githubDesc'),
        aliases: ['github', 'source code', 'repository', 'releases'],
        render: setting => {
          setting.addButton(button => button.setButtonText(t('settings.support.openGithub')).onClick(() => { window.open(ATLAS_GITHUB_URL); }));
        },
      },
    ],
  };
}
