import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import Field from './Field';

// --- Mocks ---

// Mock CodeMirror to avoid complex DOM structures and just use a textarea for easier testing
vi.mock('@uiw/react-codemirror', () => {
  return {
    default: ({ value, onChange, className }: any) => (
      <textarea
        data-test-id="codemirror-mock"
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    ),
    json: () => { }, // Mock extension
  };
});

// Mock SDK
const mockSiblingField = {
  getValue: vi.fn(),
  onValueChanged: vi.fn(),
};

const mockSdk: any = {
  field: {
    setInvalid: vi.fn(),
    getValue: vi.fn(),
    setValue: vi.fn(),
  },
  entry: {
    fields: {
      schemaDefinition: mockSiblingField, // Default sibling field
    },
  },
  cma: {
    entry: {
      get: vi.fn(),
    },
  },
  locales: {
    default: 'en-US',
  },
  parameters: {
    instance: {
      schemaRefFieldId: 'schemaDefinition',
    },
  },
  window: {
    startAutoResizer: vi.fn(),
  },
};

vi.mock('@contentful/react-apps-toolkit', () => ({
  useSDK: () => mockSdk,
}));

describe('Field Component', () => {
  // Helper to reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful setup
    mockSdk.field.getValue.mockReturnValue(undefined); // No initial value
    mockSdk.parameters.instance.schemaRefFieldId = 'schemaDefinition';

    // Default sibling behavior
    mockSiblingField.getValue.mockReturnValue({ sys: { id: 'schema-entry-id' } });
    mockSiblingField.onValueChanged.mockImplementation(() => () => { }); // Return detach fn

    // Default CMA entry fetch (Schema)
    mockSdk.cma.entry.get.mockResolvedValue({
      fields: {
        schema: {
          'en-US': {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' }
            },
            required: ['name']
          }
        }
      }
    });

    // Reset entry fields in case a test changed them
    mockSdk.entry.fields = {
      schemaDefinition: mockSiblingField,
    };
  });

  describe('1. Initialization & Loading', () => {
    it('renders loading state initially and sets field to invalid', async () => {
      // Delay the schema fetch to allow us to check loading state
      mockSdk.cma.entry.get.mockImplementation(async () => {
        await new Promise(res => setTimeout(res, 100)); // Sleep 100ms
        return { fields: { schema: { 'en-US': {} } } };
      });

      render(<Field />);

      // Check for loading text
      expect(screen.getByText('Loading Schema...')).toBeInTheDocument();

      // Should lock the field immediately
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(true);

      // Wait for finish
      await waitFor(() => expect(screen.queryByText('Loading Schema...')).not.toBeInTheDocument());
    });

    it('initializes window auto resizer', async () => {
      render(<Field />);
      await waitFor(() => expect(mockSdk.window.startAutoResizer).toHaveBeenCalled());
    });
  });

  describe('2. Configuration & Schema Fetching', () => {
    it('shows error if configured sibling field does not exist', async () => {
      mockSdk.parameters.instance.schemaRefFieldId = 'nonExistentField';
      // SDK entry fields won't have this key

      render(<Field />);

      await waitFor(() => {
        expect(screen.getByText(/Configuration Error: Sibling field "nonExistentField" not found/)).toBeInTheDocument();
      });
      // Should stay invalid (was set on mount/loading)
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(true);
    });

    it('shows message if sibling field has no value (no schema linked)', async () => {
      mockSiblingField.getValue.mockReturnValue(null); // No link

      render(<Field />);

      await waitFor(() => {
        expect(screen.getByText('Please select a Schema reference above.')).toBeInTheDocument();
      });
      // Should be invalid
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(true);
    });

    it('handles API failure when fetching schema', async () => {
      mockSdk.cma.entry.get.mockRejectedValue(new Error('API Error'));

      render(<Field />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load linked Schema entry.')).toBeInTheDocument();
      });
      // Should be invalid
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(true);
    });

    it('handles generic entry but missing schema field data', async () => {
      mockSdk.cma.entry.get.mockResolvedValue({
        fields: {
          // No 'schema' field
        }
      });

      render(<Field />);

      await waitFor(() => {
        expect(screen.getByText('Selected entry has no JSON schema content.')).toBeInTheDocument();
      });
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(true);
    });

    it('shows error if loaded schema is invalid JSON Schema (compilation fails)', async () => {
      // Return a schema that will crash AJV compile (e.g. invalid type)
      mockSdk.cma.entry.get.mockResolvedValue({
        fields: {
          schema: {
            'en-US': { type: 'invalid-type-123' }
          }
        }
      });

      render(<Field />);

      await waitFor(() => {
        expect(screen.getByText('Error: The referenced JSON Schema is invalid.')).toBeInTheDocument();
      });
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(true);
    });
  });

  describe('3. Validation Logic', () => {
    it('validates initial value correctly (Success)', async () => {
      // Schema requires name (string). We provide valid JSON.
      const validJson = { name: 'Alice', age: 30 };
      mockSdk.field.getValue.mockReturnValue(validJson);

      render(<Field />);

      // Wait for loading to finish
      await waitFor(() => expect(screen.queryByText('Loading Schema...')).not.toBeInTheDocument());

      // Should be valid
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(false);
      expect(screen.queryByText(/Please fix/)).not.toBeInTheDocument();
    });

    it('validates initial value correctly (Failure - Missing Required)', async () => {
      // Schema requires name. We provide just age.
      const invalidJson = { age: 30 };
      mockSdk.field.getValue.mockReturnValue(invalidJson);

      render(<Field />);

      await waitFor(() => expect(screen.queryByText('Loading Schema...')).not.toBeInTheDocument());

      // Should be invalid
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(true);

      // Check for specific error message
      expect(screen.getByText('is required')).toBeInTheDocument();
      // "name" might be bolded, check for text content generally or safely
      expect(screen.getByText((content) => content.includes('name'))).toBeInTheDocument();
    });

    it('validates user input changes (Success)', async () => {
      render(<Field />);
      await waitFor(() => expect(screen.queryByText('Loading Schema...')).not.toBeInTheDocument());

      const input = screen.getByTestId('codemirror-mock');

      // Input valid JSON
      fireEvent.change(input, { target: { value: JSON.stringify({ name: 'Bob' }) } });

      // Should update SDK value and set valid
      expect(mockSdk.field.setValue).toHaveBeenCalledWith({ name: 'Bob' });
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(false);
    });

    it('validates user input changes (Failure - Type Error)', async () => {
      render(<Field />);
      await waitFor(() => expect(screen.queryByText('Loading Schema...')).not.toBeInTheDocument());

      const input = screen.getByTestId('codemirror-mock');

      // Input invalid type for 'age' (expected integer, give string)
      fireEvent.change(input, { target: { value: JSON.stringify({ name: 'Bob', age: "old" }) } });

      // Should block publish (invalid)
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(true);
      // SDK setValue is NOT called for invalid custom validation usually? 
      // Logic in component: if (!isValid) setInvalid(true) else setInvalid(false) & setValue()
      // verify setValue NOT called
      expect(mockSdk.field.setValue).not.toHaveBeenCalledWith({ name: 'Bob', age: "old" });

      expect(screen.getByText(/must be integer/)).toBeInTheDocument();
    });

    it('handles JSON Syntax Error', async () => {
      render(<Field />);
      await waitFor(() => expect(screen.queryByText('Loading Schema...')).not.toBeInTheDocument());

      const input = screen.getByTestId('codemirror-mock');

      // Input BAD JSON
      fireEvent.change(input, { target: { value: '{ "name": "Broken" ' } }); // Missing brace

      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(true);
      expect(screen.getByText(/Syntax Error/)).toBeInTheDocument();
    });
  });

  describe('4. Sibling Field Interaction', () => {
    it('refetches schema when sibling value changes', async () => {
      render(<Field />);
      await waitFor(() => expect(mockSdk.cma.entry.get).toHaveBeenCalledTimes(1));

      // Trigger change
      const onChangeCallback = mockSiblingField.onValueChanged.mock.calls[0][0];

      await act(async () => {
        onChangeCallback({ sys: { id: 'new-schema-id' } });
      });

      expect(mockSdk.cma.entry.get).toHaveBeenCalledTimes(2);
      expect(mockSdk.cma.entry.get).toHaveBeenLastCalledWith({ entryId: 'new-schema-id' });
    });

    it('handles sibling removing the link (null value)', async () => {
      render(<Field />);
      await waitFor(() => expect(screen.queryByText('Loading Schema...')).not.toBeInTheDocument());

      const onChangeCallback = mockSiblingField.onValueChanged.mock.calls[0][0];

      await act(async () => {
        onChangeCallback(null);
      });

      expect(screen.getByText('Please select a Schema reference above.')).toBeInTheDocument();
      expect(mockSdk.field.setInvalid).toHaveBeenCalledWith(true);
    });

    it('unsubscribes from sibling field on unmount', async () => {
      const detachFn = vi.fn();
      mockSiblingField.onValueChanged.mockReturnValue(detachFn);

      const { unmount } = render(<Field />);

      unmount();

      expect(detachFn).toHaveBeenCalled();
    });
  });

  describe('5. Error Formatting Helper', () => {
    // Integration tests for formatErrorMessage via UI check
    it('formats required field errors legibly', async () => {
      mockSdk.field.getValue.mockReturnValue({}); // Missing 'name'
      render(<Field />);
      await waitFor(() => expect(screen.getByText(/is required/)).toBeInTheDocument());
      // Check if path is nice, e.g. "Document" or "/name" -> "name"
      // In component: fieldPath = instancePath + missingProperty
      // instancePath is empty string for root. missingProperty is 'name'. 
      // Result: "/name" -> "name"
      expect(screen.getByText((content, element) => {
        return element?.tagName.toLowerCase() === 'strong' && content === 'name';
      })).toBeInTheDocument();
    });

    it('formats nested path errors', async () => {
      // Schema with nested object
      mockSdk.cma.entry.get.mockResolvedValue({
        fields: {
          schema: {
            'en-US': {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    email: { type: 'string' }
                  },
                  required: ['email']
                }
              },
              required: ['user']
            }
          }
        }
      });

      mockSdk.field.getValue.mockReturnValue({ user: {} }); // Missing email inside user

      render(<Field />);
      await waitFor(() => expect(screen.getByText(/is required/)).toBeInTheDocument());

      // Path should be "user › email" or similar
      expect(screen.getByText(/user › email/)).toBeInTheDocument();
    });
  });
});
