import { Pull } from "../pull";
import {
  Box
} from "@chakra-ui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserCheck,
} from "@fortawesome/free-solid-svg-icons";

export function Assignee({ pull }: { pull: Pull }) {
  if (!pull.assignedToMe()) {
    return null;
  }
  return (
    <Box position="absolute" top="2px" left="5px">
      <FontAwesomeIcon
        icon={faUserCheck}
        title="Assigned to you"
        color="var(--assignee-icon)"
      />
    </Box>
  );
}
