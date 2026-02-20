from enum import Enum

class Role(str, Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    FRONT_DESK = "FRONT_DESK"
    COACH = "COACH"
    EMPLOYEE = "EMPLOYEE"
    CUSTOMER = "CUSTOMER"
