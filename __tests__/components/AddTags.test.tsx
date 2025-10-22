import { fireEvent, render, screen } from '@testing-library/react';
import AddTags from '../../components/keywords/AddTags';
import { useUpdateKeywordTags } from '../../services/keywords';

jest.mock('../../services/keywords', () => ({
   useUpdateKeywordTags: jest.fn(),
}));

const mockUseUpdateKeywordTags = useUpdateKeywordTags as unknown as jest.Mock;

const baseKeyword: KeywordType = {
   ID: 1,
   keyword: 'alpha keyword',
   device: 'desktop',
   country: 'US',
   domain: 'example.com',
   lastUpdated: '2024-01-01T00:00:00.000Z',
   added: '2024-01-01T00:00:00.000Z',
   position: 5,
   volume: 100,
   sticky: false,
   history: {},
   lastResult: [],
   url: '',
   tags: [],
   updating: false,
   lastUpdateError: false,
};

describe('AddTags', () => {
   const mutateMock = jest.fn();
   const closeModal = jest.fn();

   beforeEach(() => {
      jest.clearAllMocks();
      mutateMock.mockReset();
      mockUseUpdateKeywordTags.mockReturnValue({ mutate: mutateMock });
   });

   it('filters out blank tag entries before submitting', () => {
      render(
         <AddTags keywords={[baseKeyword]} existingTags={[]} closeModal={closeModal} />,
      );

      const input = screen.getByPlaceholderText('Insert Tags. eg: tag1, tag2');
      fireEvent.change(input, { target: { value: 'primary, ,  , secondary  ' } });

      const applyButton = screen.getByText('Apply');
      fireEvent.click(applyButton);

      expect(mutateMock).toHaveBeenCalledWith({ tags: { 1: ['primary', 'secondary'] } });
   });
});
