from backend.models import CourseNode, GroupNode


def parse_expression(exp: str) -> CourseNode | GroupNode:
    """Parse legacy course expression into AST.

    Operator precedence (low -> high):
        ;  sequence
        |  any (or)
        &  all (and)
    """
    exp = exp.strip().replace(" ", "").replace("&&", "&").replace("||", "|")
    if not exp:
        raise ValueError("Empty course expression")
    parts = [parse_sequence(part) for part in exp.split(";")]
    if len(parts) == 1:
        return parts[0]
    return GroupNode(type="group", op="sequence", children=parts)


def parse_sequence(exp: str) -> CourseNode | GroupNode:
    parts = [parse_and(part) for part in exp.split("|")]
    if len(parts) == 1:
        return parts[0]
    return GroupNode(type="group", op="any", children=parts)


def parse_and(exp: str) -> CourseNode | GroupNode:
    parts = [parse_course(part) for part in exp.split("&")]
    if len(parts) == 1:
        return parts[0]
    return GroupNode(type="group", op="all", children=parts)


def parse_course(exp: str) -> CourseNode:
    return CourseNode(type="course", id=exp)


def to_expression(node: CourseNode | GroupNode) -> str:
    """Convert AST back to legacy expression string."""
    if node.type == "course":
        return node.id
    if node.op == "sequence":
        return ";".join(to_expression(child) for child in node.children)
    if node.op == "any":
        return "|".join(to_expression(child) for child in node.children)
    if node.op == "all":
        return "&".join(to_expression(child) for child in node.children)
    raise ValueError(f"Unknown node: {node}")
