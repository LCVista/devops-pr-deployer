import {extractVars} from "../src/slash_command";

test('extractVars should handle no vars gracefully', () => {
    // Arrange
    const line = ""
    // Act
    const result = extractVars(line);

    // Assert
    expect(result).toBeDefined();
    expect(Object.keys(result).length).toBe(0);
});

test('extractVars should handle default var as db_name', () => {
    // Arrange
    const line = "withum"
    // Act
    const result = extractVars(line);

    // Assert
    expect(result).toBeDefined();
    expect(Object.keys(result).length).toBe(1);
    expect(result['db_name']).toBe('withum');
});

test('extractVars should handle named vars', () => {
    // Arrange
    const line = "favorite=blue enable_multitenant=true"
    // Act
    const result = extractVars(line);

    // Assert
    expect(result).toBeDefined();
    expect(Object.keys(result).length).toBe(2);
    expect(result['favorite']).toBe('blue');
    expect(result['enable_multitenant']).toBe('true');
});

test('extractVars should handle db and named vars', () => {
    // Arrange
    const line = " withum favorite=blue     enable_multitenant=true  "
    // Act
    const result = extractVars(line);

    // Assert
    expect(result).toBeDefined();
    expect(Object.keys(result).length).toBe(3);
    expect(result['favorite']).toBe('blue');
    expect(result['enable_multitenant']).toBe('true');
    expect(result['db_name']).toBe('withum');
});
