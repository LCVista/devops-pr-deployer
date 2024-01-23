export type CommandVars = {
    [key: string]: string
}

export function extractCmd(line: string): string {
    if (!line || line.length < 2 || !line.startsWith('/')){
        console.debug('The first line of the comment is not a valid slash command.')
        return "";
    }

    const firstToken = line.split(' ')[0]
    return firstToken.slice(1) // remove leading slash
}

export function extractVars(line: string): CommandVars {
    if (!line || line.length == 0){
        return {};
    }

    return line
        .split(/\s+/g)
        .reduce( (accum, entry) => {
            let sides = entry.split('=');
            if (sides.length == 2) {
                accum[sides[0]] = sides[1].trim();
            } else if (sides.length == 1 && sides[0].length > 0){
                accum['db_name'] = sides[0];
            } else {
                //console.debug(`Bad split for ${entry}, ${sides}`);
            }
            return accum;
        }, {})
}
