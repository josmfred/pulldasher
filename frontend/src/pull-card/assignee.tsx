import { Pull } from "../pull";
import { chakra } from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserCheck,
} from "@fortawesome/free-solid-svg-icons";

// Rendered inline before the pull title; only shown when the current user
// is one of the pull's assignees.
export function Assignee({ pull }: { pull: Pull }) {
  if (!pull.assignedToMe()) {
    return null;
  }
  return (
    <chakra.span mr="0.5em">
      <FontAwesomeIcon
        icon={faUserCheck}
        title="Assigned to you"
        color="var(--assignee-icon)"
      />
    </chakra.span>
  );
}
