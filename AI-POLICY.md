# Atlas-vtt's AI Policy

## Atlas' general goals
- Make it easy to create, own and share TTRPG content using ordinary files and Obsidian notes that remain under the user's control.
- Keep the GM's notes, worldbuilding and virtual tabletop in one workspace, reducing the need to switch between Obsidian and separate VTT software.
- Be a free, open-source and hackable VTT built as an Obsidian plugin, where users can contribute to and help maintain the core project.
- Make Atlas extensible and friendly to the wider Obsidian ecosystem, enabling developers and creators to build companion plugins, themes, content packs and other integrations around it.


## Summary AI Policy

Atlas VTT distinguishes between **AI-assisted software development** and **generative AI used to create artistic or creative content**.

- Atlas itself is developed with AI assistance. AI is treated as a development tool, similar to an IDE, autocomplete, refactoring tools, or other layers of abstraction that help a small open-source team build and maintain software.
- The use of AI does not reduce human responsibility. Contributors must review and understand the code they submit, be able to explain and modify it, and take responsibility for its quality, safety, testing, and maintainability.
- AI tools must not be used to transfer the burden of understanding, debugging, or validating a contribution onto Atlas maintainers. A contributor being unable to meaningfully explain their own submission is grounds for declining a PR.
- Atlas does not intend to include built-in generative AI features in the core application. Using AI to help build Atlas is considered separate from making AI-generated content part of the Atlas user experience.
- Atlas values human-created art, writing, music, adventures, maps, and other creative work. We do not encourage replacing this kind of creative work with generative AI, and encourage clear labels such as **"AI assisted"** when generative AI contributes to creative content, so people can make informed choices about what they share and use.
- Atlas recognizes that there are unresolved ethical questions around generative AI, including training data, creators' rights, environmental costs, and its effects on creative professions. This policy does not claim those questions are settled.
- Atlas can set standards for its own repositories, official content, documentation, and contributions. It cannot control third-party Obsidian Community Plugins, BRAT plugins, companion projects, content packs, or what individual users place in their own vaults.
- Atlas remains focused on being an open-source, local-first, user-controlled VTT. AI-assisted development should serve that goal, not replace the human judgment, creativity, and responsibility behind the project.

## Background

### Third-party plugins and the Obsidian ecosystem

Atlas VTT is built on Obsidian and benefits from its open ecosystem of community plugins, themes, and extensions. Atlas encourages developers and content creators to build companion plugins, integrations, and shareable content that expand what users can do with Atlas.

However, Atlas does not control the development or distribution of third-party plugins, whether installed through Obsidian's Community Plugins directory, BRAT, or other means. Atlas therefore cannot guarantee that these extensions comply with this policy or meet Atlas' standards for security, privacy, maintainability, or AI-generated content.

Plugins submitted to Obsidian's official Community Plugins directory are subject to Obsidian's own developer policies and review process. These establish expectations for plugin quality, security, transparency, and ongoing maintenance. Developers are expected to take responsibility for their submissions and respond to issues raised by users or reviewers.[^obsidian-policy]

Atlas encourages third-party developers to follow the principles outlined in this policy, particularly regarding human responsibility, transparency, and respect for creative work, but cannot require or enforce compliance outside projects it maintains.

### Official content sharing

Atlas may set and enforce stronger standards for content submitted to an official Atlas-operated sharing platform, currently codenamed Armarium. Its planned safeguards include automated scanning for malicious software and manual review for licensing violations. Platform-specific content standards and moderation may develop over time; any rules for AI-assisted creative content should be documented transparently as the platform is developed. This policy leaves that possibility open without imposing those platform rules on independent third-party projects or content shared elsewhere.

### Separation of AI-assisted development and creative content

Atlas distinguishes between using generative AI to assist with software development and using it to produce the creative content that people come to tabletop roleplaying games to experience.

We recognize the concerns within the TTRPG community regarding AI-generated artwork, music, writing, adventures, and other creative material.[^dadi] Atlas values human creativity and believes that the people, experiences, and intentions behind creative work are an important part of its value. Replacing that human expression with mass-produced, AI-generated content risks diminishing the community's opportunities for meaningful creative exchange.

Atlas therefore does not encourage the use of generative AI to replace human-created artistic or narrative content. We encourage creators who share content within the wider Atlas ecosystem to be transparent about their use of generative AI, including with labels such as **"AI assisted"** when it contributed to their work.

Software development serves a different purpose. Atlas is a tool intended to help GMs and players create, manage, and share their own worlds with as little friction as possible. AI-assisted coding is treated as a development tool, comparable to other forms of automation and abstraction that help developers build and maintain software.

Atlas itself has been developed with AI assistance, making a project of this scope feasible for a very small development team. However, its design, architecture, technical direction, review, and maintenance remain human responsibilities.

Atlas recognizes that broader ethical questions surrounding generative AI, including training data, creators' rights, and environmental impact, remain unresolved. Permitting AI-assisted development does not imply that these concerns are dismissed.

**The determining factor for accepting code is not how much AI was used, but whether a human contributor understands, reviews, and takes responsibility for the result.**

## Contributions to Atlas Core

Atlas welcomes contributions to its core codebase, including contributions developed with substantial AI assistance. All contributions, regardless of how they were produced, are subject to the same standards of quality, security, readability, and maintainability.

Contributors are responsible for reviewing and understanding the code they submit. They must be able to explain its behavior and design decisions, respond meaningfully to review feedback, and make necessary corrections or improvements.

AI-assisted contributions must not transfer the burden of understanding, testing, or debugging submitted code onto Atlas maintainers. If a contributor cannot adequately explain or modify their own implementation, maintainers may request changes or decline the contribution.

To facilitate effective review, pull requests should include:

- **Purpose and scope:** A clear explanation of what the contribution changes and why.
- **AI assistance:** A brief description of any substantial AI involvement, including an approximate extent of AI-generated implementation where reasonably assessable. Precise percentages are not required.
- **Human verification:** A description of what was manually reviewed and tested, including relevant test results and any limitations.
- **Maintainability:** An explanation of significant architectural decisions, new dependencies, or measures taken to keep the implementation readable, concise, and consistent with existing project conventions.
- **Known risks:** Any known limitations, unresolved issues, or areas requiring particular attention during review.

Contributors are expected to engage respectfully and constructively with maintainers and other community members. Reviews should focus on the quality and behavior of the contribution rather than assumptions about the tools used to produce it.

Maintainers retain discretion to request additional documentation, tests, simplification, or changes before accepting a contribution. Meeting the requirements of this policy does not guarantee that a pull request will be merged.

## Atlas as a Product

Atlas VTT may use AI-assisted development tools during implementation, but this does not mean that generative AI is part of Atlas' product direction.

Atlas is intended to remain a local-first, user-controlled tool for running and preparing tabletop roleplaying games. The purpose of Atlas is to reduce friction between the GM's notes, campaign material, and virtual tabletop—not to automate the creative work of running or creating a game.

Atlas therefore does not currently intend to include built-in generative AI features in the core application. This includes features whose primary purpose is to generate artwork, music, adventures, dialogue, maps, characters, or similar creative content.

The use of AI during software development should be considered separately from the features exposed to Atlas users.

Atlas also aims to avoid product practices that undermine user control or trust, including advertising and unnecessary telemetry. Changes to these principles should be made deliberately and transparently rather than introduced indirectly through individual contributions.


## Security and User Data

Atlas operates inside Obsidian and may interact directly with files in a user's vault. Contributions therefore have the potential to affect campaign notes, scenes, maps, tokens, configuration, and other user-controlled data.

All contributors are expected to treat user data and filesystem operations with particular care, regardless of whether AI tools were involved in producing the code.

Changes involving any of the following may receive additional scrutiny during review:

- reading, writing, moving, or deleting files;
- migrations or changes to stored Atlas data;
- network requests or external services;
- authentication or credentials;
- importing or exporting user content;
- serialization and deserialization of persistent data;
- execution of external processes or use of privileged Obsidian, Electron, or operating-system APIs.

AI-generated suggestions in these areas must be reviewed and tested by a human contributor before submission. A generated implementation appearing to work is not sufficient evidence that it is safe.

Contributors should avoid introducing unnecessary collection, transmission, or persistence of user data. Where a feature requires network access or handling data outside the user's vault, that behavior should be clearly documented and limited to what is necessary for the feature to function.

Changes that could cause data loss or irreversible modification should include appropriate safeguards, testing, and, where practical, a recovery or migration strategy.

## Changes to This Policy

AI tools, development practices, Obsidian, and Atlas itself are all expected to change over time. This policy may therefore be revised as the project and its surrounding ecosystem evolve.

Changes should preserve the principles behind this policy rather than relying only on the capabilities or limitations of specific tools available today.

Significant changes to Atlas' position on matters such as AI-assisted development, generative AI features in the core product, creative-content standards, telemetry, or contributor responsibilities should be made transparently and documented in the repository.

Contributors and community members are welcome to propose changes or clarifications through the project's normal discussion and contribution channels.

## References

[^obsidian-policy]: Obsidian, *Developer Policies*.  
    https://docs.obsidian.md/community-directory/developer-policies

[^foundry-ai]: Foundry Virtual Tabletop, *AI Content Policy*.  
    https://foundryvtt.com/article/ai-policy/

[^jack-conte]: Jack Conte, talk on AI, creativity, and human-made work.  
    https://www.youtube.com/watch?v=17_HcR95YBc

[^dadi]: Daði, *Mystic Arts* — discussion of generative AI and creative work.  
    https://youtu.be/spq0HSP4Mnc

