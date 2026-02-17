from enum import Enum

class Role(str, Enum):
    ADMIN = "ADMIN"
    COACH = "COACH"
    EMPLOYEE = "EMPLOYEE"
    CUSTOMER = "CUSTOMER"
