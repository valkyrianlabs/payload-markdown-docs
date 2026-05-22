import type { Field, GroupField } from 'payload'

export type DocsSkillCTAFieldOptions = {
  name?: string
}

const enabledCondition = (_data: Partial<unknown>, siblingData: Partial<Record<string, unknown>>) =>
  siblingData?.enabled === true

export const skillCTAFields = ({
  name = 'skills',
}: DocsSkillCTAFieldOptions = {}): GroupField => ({
  name,
  type: 'group',
  admin: {
    description: 'Feature available skill downloads from the selected docs set.',
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'display',
          type: 'select',
          admin: {
            condition: enabledCondition,
            width: '33%',
          },
          defaultValue: 'buttons',
          options: [
            {
              label: 'Buttons',
              value: 'buttons',
            },
            {
              label: 'Tabs',
              value: 'tabs',
            },
            {
              label: 'Cards',
              value: 'cards',
            },
          ],
        },
        {
          name: 'heading',
          type: 'text',
          admin: {
            condition: enabledCondition,
            width: '33%',
          },
        },
        {
          name: 'description',
          type: 'text',
          admin: {
            condition: enabledCondition,
            width: '33%',
          },
        },
      ],
    },
  ] satisfies Field[],
})
