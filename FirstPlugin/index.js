export const name = 'dsh-plugin-echo'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: 'echo',
    description: 'Echo the given text back, optionally with a prefix.',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo back.' } },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { echoed: { type: 'string' } },
        required: ['echoed'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: value.echoed }],
    },
    async execute(args) {
      return { echoed: args.text }
    },
  })
}
