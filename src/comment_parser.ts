export type CommandVars = {
    [key: string]: string
}

export function extractCmd(line: string): string {
    if (!line || line.length < 2 || !line.startsWith('/')){
        console.debug('The first line of the comment is not a valid slash command.')
        return "";
    }

    const cmdToken = tokenize(line)[0]

    return cmdToken.slice(1) // remove leading slash
}

export function extractVars(line: string): CommandVars {
    const reducer = (memo, element) => {
        const sides = element.split('=')

        if (sides.length === 1 && sides[0] === "s3") {
            memo["backend"] = sides[0]
        } else if (sides.length === 1) {
            memo["db_name"] = sides[0]
        } else if (sides.length === 2) {
            memo["env_vars"][sides[0]] = sides[1]
        } else {
            console.log(`warning: could not process ${element}`)
        }

        return memo
    }
    const tokens = tokenize(line).slice(1) // remove leading command token

    return tokens.reduce(reducer, {})
}

function tokenize(value: string): Array<string> {
    const fmt = value.replace(/\s+=\s+/g, "=") // trim whitespace around equal signs
    return fmt.split(/\s+/g);
}
